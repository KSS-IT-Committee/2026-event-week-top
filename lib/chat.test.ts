import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHAT_RESET_SIGNAL } from "@/lib/chat-protocol";

import { type ChatMessage, runChat } from "./chat";

vi.mock("@/lib/knowledge", () => ({ retrieveKnowledge: vi.fn() }));
vi.mock("@/lib/chat-tools", () => ({
  chatToolDeclarations: [],
  dispatchTool: vi.fn(),
}));
vi.mock("@/lib/gemini", () => ({
  getGemini: vi.fn(),
  chatModelOrder: vi.fn(),
  isModelUnavailableError: vi.fn(),
  noteModelUnavailable: vi.fn(),
  MAX_MODEL_ATTEMPTS: 3,
}));

import { dispatchTool } from "@/lib/chat-tools";
import {
  chatModelOrder,
  getGemini,
  isModelUnavailableError,
  noteModelUnavailable,
} from "@/lib/gemini";
import { retrieveKnowledge } from "@/lib/knowledge";

// A single Gemini-style streamed chunk. `candidates[0].content.parts` is the
// only path runChat reads; everything else on a real chunk is irrelevant here.
type Part = {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args: Record<string, unknown> };
};
type Chunk = {
  candidates: { content: { parts: Part[] } }[];
};

// Build an async-iterable stream of Gemini-style chunks from the given parts,
// one chunk per argument. Mirrors `ai.models.generateContentStream`'s return.
async function* streamOf(...chunks: Chunk[]): AsyncGenerator<Chunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

// Convenience chunk builders.
function textChunk(text: string): Chunk {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}
function thoughtChunk(text: string): Chunk {
  return { candidates: [{ content: { parts: [{ text, thought: true }] } }] };
}
function toolChunk(name: string, args: Record<string, unknown> = {}): Chunk {
  return {
    candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }],
  };
}

// A fake Gemini client whose `.models.generateContentStream` returns the next
// prepared stream on each call. Each entry is a factory so a stream can be
// re-evaluated fresh (and so a factory can throw synchronously). Successive
// turns/attempts therefore consume successive streams in order.
function fakeGeminiFromStreams(
  factories: (() => AsyncGenerator<Chunk>)[],
): ReturnType<typeof getGemini> {
  const queue = [...factories];
  return {
    models: {
      generateContentStream: vi.fn(async () => {
        const next = queue.shift();
        if (!next) throw new Error("no more prepared streams");
        return next();
      }),
    },
  } as unknown as ReturnType<typeof getGemini>;
}

// Collect every yielded string from the async generator into an array.
async function drain(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const value of gen) {
    out.push(value);
  }
  return out;
}

const VIEWER = { className: null } as const;

describe("runChat", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.mocked(retrieveKnowledge).mockResolvedValue([]);
    vi.mocked(chatModelOrder).mockReturnValue(["m1", "m2", "m3"]);
    vi.mocked(isModelUnavailableError).mockReturnValue(true);
    vi.mocked(dispatchTool).mockResolvedValue({ ok: true });
  });

  it("streams a plain text answer across multiple chunks and appends no safety net", async () => {
    vi.mocked(chatModelOrder).mockReturnValue(["m1"]);
    const gemini = fakeGeminiFromStreams([
      () => streamOf(textChunk("こんに"), textChunk("ちは")),
    ]);
    vi.mocked(getGemini).mockReturnValue(gemini);

    const out = await drain(
      runChat([{ role: "user", text: "hi" }], { className: null }),
    );

    expect(out.join("")).toBe("こんにちは");
    expect(
      out.some((s) => s.includes("うまく回答をまとめられませんでした")),
    ).toBe(false);
    expect(out).not.toContain(CHAT_RESET_SIGNAL);
    expect(gemini.models.generateContentStream).toHaveBeenCalledTimes(1);
  });

  it("ignores model 'thought' parts when accumulating the answer", async () => {
    vi.mocked(chatModelOrder).mockReturnValue(["m1"]);
    const gemini = fakeGeminiFromStreams([
      () =>
        streamOf(
          thoughtChunk("内部思考"),
          textChunk("答え"),
          thoughtChunk("また思考"),
        ),
    ]);
    vi.mocked(getGemini).mockReturnValue(gemini);

    const out = await drain(runChat([{ role: "user", text: "hi" }], VIEWER));

    expect(out.join("")).toBe("答え");
    expect(out.join("")).not.toContain("思考");
  });

  it("runs a tool call, feeds the result back, then streams the answer", async () => {
    const gemini = fakeGeminiFromStreams([
      () => streamOf(toolChunk("get_recent_news", {})),
      () => streamOf(textChunk("答え")),
    ]);
    vi.mocked(getGemini).mockReturnValue(gemini);
    vi.mocked(dispatchTool).mockResolvedValue({ news: [] });
    const viewer = { className: null };

    const out = await drain(runChat([{ role: "user", text: "news?" }], viewer));

    expect(out.join("")).toBe("答え");
    expect(dispatchTool).toHaveBeenCalledTimes(1);
    expect(dispatchTool).toHaveBeenCalledWith("get_recent_news", {}, viewer);
    expect(gemini.models.generateContentStream).toHaveBeenCalledTimes(2);
  });

  it("emits CHAT_RESET_SIGNAL and re-answers when a model fails mid-stream", async () => {
    vi.mocked(chatModelOrder).mockReturnValue(["m1", "m2"]);
    vi.mocked(isModelUnavailableError).mockReturnValue(true);
    const gemini = fakeGeminiFromStreams([
      () =>
        (async function* () {
          yield textChunk("部分");
          throw new Error("503 UNAVAILABLE");
        })(),
      () => streamOf(textChunk("完全")),
    ]);
    vi.mocked(getGemini).mockReturnValue(gemini);

    const out = await drain(runChat([{ role: "user", text: "hi" }], VIEWER));

    expect(out).toEqual(["部分", CHAT_RESET_SIGNAL, "完全"]);
    const partialIdx = out.indexOf("部分");
    const resetIdx = out.indexOf(CHAT_RESET_SIGNAL);
    const finalIdx = out.indexOf("完全");
    expect(partialIdx).toBeLessThan(resetIdx);
    expect(resetIdx).toBeLessThan(finalIdx);
    expect(noteModelUnavailable).toHaveBeenCalledWith("m1", expect.any(Error));
  });

  it("treats a knowledge-retrieval rejection as non-fatal and still answers", async () => {
    vi.mocked(chatModelOrder).mockReturnValue(["m1"]);
    vi.mocked(retrieveKnowledge).mockRejectedValue(new Error("embed 429"));
    const gemini = fakeGeminiFromStreams([() => streamOf(textChunk("答え"))]);
    vi.mocked(getGemini).mockReturnValue(gemini);

    const out = await drain(runChat([{ role: "user", text: "hi" }], VIEWER));

    expect(out.join("")).toBe("答え");
  });

  it("yields the Japanese safety net when every turn only calls tools", async () => {
    // Five tool-call-only streams: one per MAX_TOOL_ITERATIONS turn. Each turn
    // gets a tool call (so it loops) and never any text, so after the loop the
    // safety net is the only text produced.
    const streamFactories = Array.from(
      { length: 5 },
      () => () => streamOf(toolChunk("get_announcements", {})),
    );
    const gemini = fakeGeminiFromStreams(streamFactories);
    vi.mocked(getGemini).mockReturnValue(gemini);
    vi.mocked(dispatchTool).mockResolvedValue({});

    const out = await drain(runChat([{ role: "user", text: "hi" }], VIEWER));

    expect(out.join("")).toContain("うまく回答をまとめられませんでした");
    expect(gemini.models.generateContentStream).toHaveBeenCalledTimes(5);
    expect(dispatchTool).toHaveBeenCalledTimes(5);
  });

  it("rethrows immediately when the request is already aborted", async () => {
    vi.mocked(chatModelOrder).mockReturnValue(["m1", "m2"]);
    vi.mocked(isModelUnavailableError).mockReturnValue(true);
    const controller = new AbortController();
    controller.abort();
    const gemini = fakeGeminiFromStreams([
      () =>
        (async function* (): AsyncGenerator<Chunk> {
          throw new Error("aborted by client");
        })(),
    ]);
    vi.mocked(getGemini).mockReturnValue(gemini);

    await expect(
      drain(runChat([{ role: "user", text: "hi" }], VIEWER, controller.signal)),
    ).rejects.toThrow("aborted by client");
  });

  it("rethrows a non-model-unavailable error that occurs after partial text", async () => {
    vi.mocked(chatModelOrder).mockReturnValue(["m1", "m2"]);
    vi.mocked(isModelUnavailableError).mockReturnValue(false);
    const gemini = fakeGeminiFromStreams([
      () =>
        (async function* () {
          yield textChunk("部分");
          throw new Error("genuine bug");
        })(),
    ]);
    vi.mocked(getGemini).mockReturnValue(gemini);

    const gen = runChat([{ role: "user", text: "hi" }], VIEWER);
    // The partial text is yielded first, then the rethrow surfaces on next pull.
    const first = await gen.next();
    expect(first.value).toBe("部分");
    await expect(gen.next()).rejects.toThrow("genuine bug");
    expect(noteModelUnavailable).not.toHaveBeenCalled();
  });

  it("retries on the next model after an empty response (no text, no tool call)", async () => {
    vi.mocked(chatModelOrder).mockReturnValue(["m1", "m2"]);
    const gemini = fakeGeminiFromStreams([
      // Empty stream: zero chunks → textBuf "" and no function calls.
      () => streamOf(),
      () => streamOf(textChunk("答え")),
    ]);
    vi.mocked(getGemini).mockReturnValue(gemini);

    const out = await drain(runChat([{ role: "user", text: "hi" }], VIEWER));

    expect(out.join("")).toBe("答え");
    expect(gemini.models.generateContentStream).toHaveBeenCalledTimes(2);
    // An empty turn is not a thrown model-unavailable error, so it is NOT noted.
    expect(noteModelUnavailable).not.toHaveBeenCalled();
  });

  it("runs without a last user message (no knowledge retrieval) and still answers", async () => {
    vi.mocked(chatModelOrder).mockReturnValue(["m1"]);
    const gemini = fakeGeminiFromStreams([() => streamOf(textChunk("答え"))]);
    vi.mocked(getGemini).mockReturnValue(gemini);

    const messages: ChatMessage[] = [{ role: "model", text: "prior" }];
    const out = await drain(runChat(messages, VIEWER));

    expect(out.join("")).toBe("答え");
    expect(retrieveKnowledge).not.toHaveBeenCalled();
  });

  it("uses the latest user message text for knowledge retrieval", async () => {
    vi.mocked(chatModelOrder).mockReturnValue(["m1"]);
    const gemini = fakeGeminiFromStreams([() => streamOf(textChunk("答え"))]);
    vi.mocked(getGemini).mockReturnValue(gemini);

    const messages: ChatMessage[] = [
      { role: "user", text: "first" },
      { role: "model", text: "reply" },
      { role: "user", text: "latest" },
    ];
    await drain(runChat(messages, VIEWER));

    expect(retrieveKnowledge).toHaveBeenCalledTimes(1);
    expect(retrieveKnowledge).toHaveBeenCalledWith("latest");
  });

  it("resets after each mid-stream failure and falls to the safety net when all attempts fail", async () => {
    // Two models, both stream partial text then fail (model-unavailable). Each
    // failure emits a reset (clearing the streamed-partial flag), so after the
    // attempts are exhausted the streamed-partial early-return does NOT fire and
    // the safety net is appended. Both failing models are noted as unavailable.
    vi.mocked(chatModelOrder).mockReturnValue(["m1", "m2"]);
    vi.mocked(isModelUnavailableError).mockReturnValue(true);
    const gemini = fakeGeminiFromStreams([
      () =>
        (async function* () {
          yield textChunk("一部");
          throw new Error("429 quota");
        })(),
      () =>
        (async function* () {
          yield textChunk("二部");
          throw new Error("503 overloaded");
        })(),
    ]);
    vi.mocked(getGemini).mockReturnValue(gemini);

    const out = await drain(runChat([{ role: "user", text: "hi" }], VIEWER));

    expect(out.slice(0, 4)).toEqual([
      "一部",
      CHAT_RESET_SIGNAL,
      "二部",
      CHAT_RESET_SIGNAL,
    ]);
    expect(out[out.length - 1]).toContain("うまく回答をまとめられませんでした");
    expect(noteModelUnavailable).toHaveBeenCalledWith("m1", expect.any(Error));
    expect(noteModelUnavailable).toHaveBeenCalledWith("m2", expect.any(Error));
  });

  it("falls through to the safety net when all attempts fail with no streamed text", async () => {
    // Models fail by throwing before any text. streamedThisTurn stays false, so
    // after exhausting attempts the loop breaks to the safety-net message.
    vi.mocked(chatModelOrder).mockReturnValue(["m1", "m2", "m3"]);
    vi.mocked(isModelUnavailableError).mockReturnValue(true);
    const gemini = fakeGeminiFromStreams([
      () =>
        (async function* (): AsyncGenerator<Chunk> {
          throw new Error("429 quota");
        })(),
      () =>
        (async function* (): AsyncGenerator<Chunk> {
          throw new Error("503 overloaded");
        })(),
      () =>
        (async function* (): AsyncGenerator<Chunk> {
          throw new Error("429 again");
        })(),
    ]);
    vi.mocked(getGemini).mockReturnValue(gemini);

    const out = await drain(runChat([{ role: "user", text: "hi" }], VIEWER));

    expect(out.join("")).toContain("うまく回答をまとめられませんでした");
    // MAX_MODEL_ATTEMPTS is 3, modelOrder length 3 → 3 attempts, then break.
    expect(gemini.models.generateContentStream).toHaveBeenCalledTimes(3);
  });

  it("streams text emitted alongside a tool call, then the next turn's answer", async () => {
    // A turn that both streams text AND requests a tool keeps looping (it has a
    // tool call), so the streamed prose precedes the follow-up answer.
    const gemini = fakeGeminiFromStreams([
      () =>
        streamOf({
          candidates: [
            {
              content: {
                parts: [
                  { text: "調べます" },
                  { functionCall: { name: "get_recent_news", args: {} } },
                ],
              },
            },
          ],
        }),
      () => streamOf(textChunk("結果")),
    ]);
    vi.mocked(getGemini).mockReturnValue(gemini);
    vi.mocked(dispatchTool).mockResolvedValue({ news: [] });

    const out = await drain(runChat([{ role: "user", text: "hi" }], VIEWER));

    expect(out.join("")).toBe("調べます結果");
    expect(dispatchTool).toHaveBeenCalledTimes(1);
    expect(gemini.models.generateContentStream).toHaveBeenCalledTimes(2);
  });
});
