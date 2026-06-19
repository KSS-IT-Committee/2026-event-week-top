import "server-only";

import { GoogleGenAI } from "@google/genai";

/**
 * Lazy Gemini client for the /chat assistant. Mirrors lib/db.ts: the client is
 * built on first use and GEMINI_API_KEY is read lazily, so importing this
 * module without calling it never throws on a missing key (e.g. during build).
 *
 * GEMINI_API_KEY is server-only and must NEVER be exposed as a NEXT_PUBLIC_*
 * var — it would otherwise be baked into the client bundle.
 */

let _client: GoogleGenAI | undefined;

export function getGemini(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

// Chat model pool. The free-tier request quota that throttles /chat is charged
// PER MODEL, so each request is spread across several interchangeable
// flash-class models to multiply the available free headroom, and a request
// fails over to a different model when one is rate-limited (429) / overloaded
// (503) / returns nothing. Every model here supports function calling AND a
// TEXT response (verified against the API) and uses the standard Gemini
// tool-call format, so a request can switch models mid-conversation without
// breaking the agentic tool loop. TTS/audio-only and non-tool models are
// deliberately excluded — they 400 on `tools` / TEXT output.
//
// Setting GEMINI_MODEL pins one model (no rotation, no failover) — handy for
// local testing or forcing a specific model via env.
export const CHAT_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
] as const;

// How many distinct models to try for a single chat turn before giving up. A
// failure is most likely a per-model rate limit, so we retry on another model.
export const MAX_MODEL_ATTEMPTS = 3;

/**
 * The ordered list of models to use for one chat request. Normally a random
 * rotation of the pool (so load spreads across per-model quotas); callers use
 * element 0 as the primary for every turn and fall through to the rest only on
 * failure. If GEMINI_MODEL is set it pins that single model (no rotation).
 */
export function chatModelOrder(): string[] {
  const override = process.env.GEMINI_MODEL;
  if (override) return [override];
  // Fisher–Yates shuffle a copy so each request starts on a random model.
  const models = [...CHAT_MODELS];
  for (let i = models.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [models[i], models[j]] = [models[j], models[i]];
  }
  return models;
}

// There is deliberately NO embedding-model constant here: the query embedding
// must use the exact model the corpus was embedded with, which is recorded as
// `model` in lib/knowledge.generated.json. Callers pass that value into
// embedText() so query and document vectors always come from the same model —
// a GEMINI_EMBED_MODEL override only applies at build time (the build script
// reads it and bakes the choice into the index).

// L2-normalize so cosine similarity reduces to a dot product. gemini-embedding-2
// already returns unit vectors (even at a reduced outputDimensionality), so this
// is an idempotent safety net that keeps callers correct across model swaps.
function normalize(values: number[]): number[] {
  let norm = 0;
  for (const v of values) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return values.map((v) => v / norm);
}

/**
 * Embed a single string and return a normalized vector. `taskType` should be
 * "RETRIEVAL_QUERY" for user questions and "RETRIEVAL_DOCUMENT" for corpus
 * text. `model` and `dimension` must match the corpus index (pass the index's
 * own `model`/`dimension`) so query and document vectors are comparable.
 */
export async function embedText(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
  dimension: number,
  model: string,
): Promise<number[]> {
  // gemini-embedding-2 dropped the taskType field (it ignores it); the task is
  // instead prepended to the text as an instruction. Older models
  // (gemini-embedding-001) still take taskType and must NOT get the prefix. Keep
  // these instruction strings in sync with scripts/build-knowledge.mjs (the
  // document-side encoder) so query and document vectors stay comparable.
  const usesTaskInstruction = model.startsWith("gemini-embedding-2");
  const contents = usesTaskInstruction
    ? taskType === "RETRIEVAL_QUERY"
      ? `task: search result | query: ${text}`
      : `title:  | text: ${text}`
    : text;
  const config = usesTaskInstruction
    ? { outputDimensionality: dimension }
    : { taskType, outputDimensionality: dimension };

  const res = await getGemini().models.embedContent({
    model,
    contents: [contents],
    config,
  });
  const values = res.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini returned an empty embedding");
  }
  return normalize(values);
}
