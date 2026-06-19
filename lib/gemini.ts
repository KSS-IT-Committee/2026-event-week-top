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

// Chat model pool, ordered best-quality first. The free-tier request quota that
// throttles /chat is charged PER MODEL, so we prefer the strongest model and
// fall back down this ladder only when a model is rate-limited (429) /
// overloaded (503) / returns nothing — using the per-model cooldown memory
// below so we keep serving the best model that still has quota instead of
// wasting a request re-probing an exhausted one. Every model here supports
// function calling AND a TEXT response (verified against the API) and uses the
// standard Gemini tool-call format, so a request can switch models
// mid-conversation without breaking the agentic tool loop. TTS/audio-only and
// non-tool models are deliberately excluded — they 400 on `tools` / TEXT output.
//
// NOTE: higher-quality models tend to have SMALLER free-tier quotas, so traffic
// degrades onto the lite fallbacks often — that's the intended graceful
// degradation. Reorder this list to change the quality preference.
//
// Setting GEMINI_MODEL pins one model (no rotation, no failover) — handy for
// local testing or forcing a specific model via env.
export const CHAT_MODELS = [
  "gemini-3.5-flash", // newest full flash — highest quality
  "gemini-3-flash-preview", // full flash
  "gemini-3.1-flash-lite", // lite — cheaper/faster, larger free quota
  "gemini-2.5-flash-lite", // oldest lite — last resort
] as const;

// How many distinct models to try for a single chat turn before giving up. A
// failure is most likely a per-model rate limit, so we retry on another model.
export const MAX_MODEL_ATTEMPTS = 3;

// Per-process memory of models that recently hit a quota/availability limit and
// the earliest time they may be retried. Best-effort and per-instance — like
// lib/rate-limit, blue/green containers don't share it, which is fine for a soft
// quality preference. It lets us keep using the best model until it's exhausted,
// then skip it (no wasted probe per request) until its cooldown lapses.
const modelCooldownUntil = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 60_000;

/**
 * A Gemini error worth switching models over: a quota (429 / RESOURCE_EXHAUSTED)
 * or overload (503 / UNAVAILABLE) failure, as opposed to a bug in our request.
 */
export function isModelUnavailableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { status?: unknown }).status;
  if (status === 429 || status === 503) return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    /RESOURCE_EXHAUSTED|UNAVAILABLE|quota|overloaded|\b429\b|\b503\b/i.test(
      message,
    )
  );
}

// Pull the API's suggested wait (e.g. `"retryDelay": "58s"`) out of the error so
// the cooldown matches the real reset window when available. The Gemini error
// body is double-encoded JSON, so the field arrives escaped as
// `\"retryDelay\": \"58s\"`; the character class tolerates the quotes/backslashes
// between the key and the value either way.
function parseRetryDelayMs(error: unknown): number | undefined {
  const message = (error as { message?: unknown })?.message;
  if (typeof message !== "string") return undefined;
  const match = message.match(/retryDelay[\\"\s:]*?(\d+(?:\.\d+)?)s/);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : undefined;
}

/**
 * Record that `model` is (briefly) unavailable so later requests skip it until
 * it may have recovered. Honors the API's retryDelay when present.
 */
export function noteModelUnavailable(model: string, error?: unknown): void {
  const retryMs = parseRetryDelayMs(error) ?? DEFAULT_COOLDOWN_MS;
  modelCooldownUntil.set(model, Date.now() + retryMs);
}

/**
 * The ordered list of models to try for one chat request: best-quality first,
 * but any model currently in cooldown (recently rate-limited) is demoted to the
 * back, so the primary is the strongest model that still has quota. Cooled
 * models stay on as a last resort (their cooldown is only an estimate). Callers
 * use element 0 as the primary and fall through on failure. GEMINI_MODEL pins
 * a single model (no rotation/failover).
 */
export function chatModelOrder(): string[] {
  const override = process.env.GEMINI_MODEL;
  if (override) return [override];
  const now = Date.now();
  const ready: string[] = [];
  const cooling: string[] = [];
  for (const model of CHAT_MODELS) {
    if ((modelCooldownUntil.get(model) ?? 0) <= now) ready.push(model);
    else cooling.push(model);
  }
  // ready[] and cooling[] each preserve the quality order; cooling trails.
  return [...ready, ...cooling];
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
