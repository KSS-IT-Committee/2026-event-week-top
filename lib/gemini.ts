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

// Chat model. Overridable via env; defaults to the cheap/fast flash-lite model
// (gemini-3.1-flash-lite has a more generous free-tier request quota than
// gemini-2.5-flash, which the agentic /chat loop — 2+ requests per tool answer
// — exhausts quickly).
//
// There is deliberately NO embedding-model constant here: the query embedding
// must use the exact model the corpus was embedded with, which is recorded as
// `model` in lib/knowledge.generated.json. Callers pass that value into
// embedText() so query and document vectors always come from the same model —
// a GEMINI_EMBED_MODEL override only applies at build time (the build script
// reads it and bakes the choice into the index).
export const CHAT_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";

// L2-normalize so cosine similarity reduces to a dot product. A reduced
// outputDimensionality from gemini-embedding-001 is not pre-normalized.
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
  const res = await getGemini().models.embedContent({
    model,
    contents: [text],
    config: { taskType, outputDimensionality: dimension },
  });
  const values = res.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini returned an empty embedding");
  }
  return normalize(values);
}
