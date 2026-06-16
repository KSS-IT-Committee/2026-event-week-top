import "server-only";

import type { Content, FunctionCall, Part } from "@google/genai";

import { chatToolDeclarations, dispatchTool } from "@/lib/chat-tools";
import { CHAT_MODEL, getGemini } from "@/lib/gemini";
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
- クラスは 1A〜6D（学年1〜6 + 組A〜D）で表されます。`;

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
 * `messages` before calling this.
 */
export async function* runChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const knowledge = lastUser ? await retrieveKnowledge(lastUser.text) : [];

  const systemInstruction = buildSystemInstruction(knowledge);
  const contents: Content[] = messages.map(toContent);
  const ai = getGemini();

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const isLastIteration = i === MAX_TOOL_ITERATIONS - 1;
    const stream = await ai.models.generateContentStream({
      model: CHAT_MODEL,
      contents,
      config: {
        systemInstruction,
        // Force a worded answer on the final allowed turn by withholding tools.
        tools: isLastIteration
          ? undefined
          : [{ functionDeclarations: chatToolDeclarations }],
        temperature: 0.4,
        maxOutputTokens: 2048,
        abortSignal: signal,
      },
    });

    let textBuf = "";
    const callParts: Part[] = [];
    const functionCalls: FunctionCall[] = [];

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.thought) continue; // never surface model "thoughts" as answer
        if (typeof part.text === "string" && part.text.length > 0) {
          textBuf += part.text;
          yield part.text;
        } else if (part.functionCall) {
          callParts.push(part);
          functionCalls.push(part.functionCall);
        }
      }
    }

    // Record this model turn so tool results have the matching call to attach to.
    const modelParts: Part[] = [];
    if (textBuf) modelParts.push({ text: textBuf });
    modelParts.push(...callParts);
    contents.push({ role: "model", parts: modelParts });

    if (functionCalls.length === 0) return; // final answer already streamed

    const responseParts: Part[] = [];
    for (const call of functionCalls) {
      const result = await dispatchTool(call.name ?? "", call.args ?? {});
      responseParts.push({
        functionResponse: { name: call.name ?? "", response: result },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  // Safety net: only reached if the final tool-less turn produced no text.
  yield "\n\n（うまく回答をまとめられませんでした。質問を少し変えてお試しください。）";
}
