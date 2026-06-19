import "server-only";

import type { Content, FunctionCall, Part } from "@google/genai";

import {
  chatToolDeclarations,
  type ChatViewer,
  dispatchTool,
} from "@/lib/chat-tools";
import {
  chatModelOrder,
  getGemini,
  isModelUnavailableError,
  MAX_MODEL_ATTEMPTS,
  noteModelUnavailable,
} from "@/lib/gemini";
import { type KnowledgeChunk, retrieveKnowledge } from "@/lib/knowledge";

export type ChatMessage = {
  role: "user" | "model";
  text: string;
};

// Cap on assistant turns within one request: each iteration either calls tools
// (and loops) or produces the final answer. The last allowed iteration drops
// the tools so the model is forced to answer in words.
const MAX_TOOL_ITERATIONS = 5;

const BASE_SYSTEM_INSTRUCTION = `あなたは小石川中等教育学校 IT委員会が運営する、2026年度の学校行事（創作展・体育祭・芸能祭・後夜祭など）の案内チャットボットです。

- 必ず日本語で、簡潔かつ丁寧に答えてください。
- 行事に関係のない質問には丁寧にお断りし、行事に関する質問を促してください。
- 伝達事項・備品の貸出状況・減点・ニュースなど、最新の状況が必要な場合は提供されたツールを使って確認してください。在庫数や件数を推測で答えてはいけません。
- 確実な情報がない場合は、無理に答えず「わかりません」と正直に伝えてください。
- クラスは 1A〜6D（学年1〜6 + 組A〜D）で表されます。
- 減点・伝達は、ログイン中のユーザー自身のクラス分のみ参照できます。他クラスの減点・伝達は取得できないため、求められても「自分のクラス分しか確認できません」と伝えてください。`;

function buildSystemInstruction(knowledge: KnowledgeChunk[]): string {
  if (knowledge.length === 0) return BASE_SYSTEM_INSTRUCTION;

  const refs = knowledge
    .map((chunk, i) => `## [${i + 1}] ${chunk.title}\n${chunk.text}`)
    .join("\n\n");

  return `${BASE_SYSTEM_INSTRUCTION}

# 参考情報（関連性の高い順）
以下は質問に関連する可能性のある資料です。関連する場合は根拠として用い、無関係なものは無視してください。

${refs}`;
}

function toContent(message: ChatMessage): Content {
  return { role: message.role, parts: [{ text: message.text }] };
}

/**
 * Run one assistant response as an async stream of text deltas. Retrieves
 * relevant knowledge for the latest user message, then runs an agentic loop:
 * the model may call read-only DB tools, whose results are fed back, until it
 * produces a final answer (which is streamed out as it is generated).
 *
 * The caller is responsible for auth, rate limiting, and validating/capping
 * `messages` before calling this. `viewer` carries the authenticated caller's
 * class so class-private tools can scope their results to it.
 */
export async function* runChat(
  messages: ChatMessage[],
  viewer: ChatViewer,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const knowledge = lastUser ? await retrieveKnowledge(lastUser.text) : [];

  const systemInstruction = buildSystemInstruction(knowledge);
  const contents: Content[] = messages.map(toContent);
  const ai = getGemini();

  // One randomized model rotation for the whole request: every turn uses the
  // same primary model (element 0) for a consistent voice, and only falls over
  // to the next models on failure. All pool models share the standard Gemini
  // tool-call format, so failing over mid-conversation is safe.
  const modelOrder = chatModelOrder();

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const isLastIteration = i === MAX_TOOL_ITERATIONS - 1;
    const config = {
      systemInstruction,
      // Force a worded answer on the final allowed turn by withholding tools.
      tools: isLastIteration
        ? undefined
        : [{ functionDeclarations: chatToolDeclarations }],
      temperature: 0.4,
      maxOutputTokens: 2048,
      abortSignal: signal,
    };

    let textBuf = "";
    let callParts: Part[] = [];
    let functionCalls: FunctionCall[] = [];

    // Try this turn on up to MAX_MODEL_ATTEMPTS distinct models. A thrown error
    // (most likely a per-model 429/503) or an empty response (no text, no tool
    // call) counts as "failed to return something" and fails over to the next
    // model — but only while nothing has streamed to the user yet this turn, so
    // a partially-streamed answer is never duplicated or interleaved.
    let streamedThisTurn = false;
    let gotResponse = false;
    let lastError: unknown;
    const attempts = Math.min(MAX_MODEL_ATTEMPTS, modelOrder.length);
    for (let a = 0; a < attempts; a++) {
      // Reset per-attempt accumulators so a retry starts clean.
      textBuf = "";
      callParts = [];
      functionCalls = [];
      try {
        const stream = await ai.models.generateContentStream({
          model: modelOrder[a],
          contents,
          config,
        });
        for await (const chunk of stream) {
          const parts = chunk.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (part.thought) continue; // never surface model "thoughts" as answer
            if (typeof part.text === "string" && part.text.length > 0) {
              textBuf += part.text;
              streamedThisTurn = true;
              yield part.text;
            } else if (part.functionCall) {
              callParts.push(part);
              functionCalls.push(part.functionCall);
            }
          }
        }
        // Empty turn (no text, no tool call) → treat as a failure and retry on
        // another model rather than bailing straight to the safety net.
        if (textBuf === "" && functionCalls.length === 0) {
          lastError = new Error("model returned an empty response");
          continue;
        }
        gotResponse = true;
        break;
      } catch (error) {
        lastError = error;
        // A quota/overload error means this model is (briefly) unavailable —
        // remember it so later requests skip it until it may have recovered.
        if (isModelUnavailableError(error)) {
          noteModelUnavailable(modelOrder[a], error);
        }
        // Don't retry a client-aborted request, and don't retry once we've
        // already streamed text (the user has seen partial output).
        if (signal?.aborted || streamedThisTurn) throw error;
        // otherwise fall through and try the next model
      }
    }

    if (!gotResponse) {
      // Exhausted every model attempt without a usable turn.
      if (streamedThisTurn) return; // partial answer already streamed
      console.error("[chat] all model attempts failed", lastError);
      break; // fall through to the safety-net message below
    }

    // Record this model turn so tool results have the matching call to attach to.
    const modelParts: Part[] = [];
    if (textBuf) modelParts.push({ text: textBuf });
    modelParts.push(...callParts);
    contents.push({ role: "model", parts: modelParts });

    if (functionCalls.length === 0) {
      if (textBuf !== "") return; // final answer already streamed
      break; // no tool calls and no text — fall through to the fallback below
    }

    const responseParts: Part[] = [];
    for (const call of functionCalls) {
      const result = await dispatchTool(
        call.name ?? "",
        call.args ?? {},
        viewer,
      );
      responseParts.push({
        functionResponse: { name: call.name ?? "", response: result },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  // Safety net: reached when the model produced no text — either an empty turn
  // (broke out above) or it kept calling tools until MAX_TOOL_ITERATIONS.
  yield "\n\n（うまく回答をまとめられませんでした。質問を少し変えてお試しください。）";
}
