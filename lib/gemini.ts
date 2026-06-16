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

// Chat + embedding models. Overridable via env; defaults are the cheap/fast
// flash chat model and the current embedding model. The embedding model here
// MUST match the one baked into lib/knowledge.generated.json by
// scripts/build-knowledge.mjs, or query/document vectors won't be comparable.
export const CHAT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
export const EMBED_MODEL =
  process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

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
 * text; `dimension` must equal the corpus index's dimension.
 */
export async function embedText(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
  dimension: number,
): Promise<number[]> {
  const res = await getGemini().models.embedContent({
    model: EMBED_MODEL,
    contents: [text],
    config: { taskType, outputDimensionality: dimension },
  });
  const values = res.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini returned an empty embedding");
  }
  return normalize(values);
}
