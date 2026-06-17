import "server-only";

import { embedText } from "@/lib/gemini";

import knowledgeIndex from "./knowledge.generated.json";

/**
 * Retrieval over the static knowledge corpus. The index is built offline by
 * scripts/build-knowledge.mjs (`npm run knowledge`) and committed as
 * knowledge.generated.json; we statically import it so the Docker runner ships
 * it without reading content/ at runtime.
 *
 * Search is a brute-force cosine scan. Both query and document vectors are
 * L2-normalized, so cosine === dot product. This is comfortably fast for up to
 * a few thousand chunks. If the corpus outgrows that, move the vectors into the
 * shared `appdata` DB behind pgvector (an additive 2026-db migration plus a
 * postgres image swap in ansible + vvps) and replace this scan with an ANN
 * query — the retrieveKnowledge() contract can stay identical.
 */

type StoredChunk = {
  id: string;
  source: string;
  title: string;
  text: string;
  embedding: number[];
};

type KnowledgeIndex = {
  model: string;
  dimension: number;
  chunkCount: number;
  chunks: StoredChunk[];
};

export type KnowledgeChunk = {
  id: string;
  source: string;
  title: string;
  text: string;
  score: number;
};

const index = knowledgeIndex as KnowledgeIndex;

// Discard weak matches so an off-topic question doesn't drag in unrelated text.
const MIN_SCORE = 0.5;

function dot(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Return the top-K corpus chunks most relevant to `query`, best first. Returns
 * [] when the corpus is empty (no knowledge added yet), so callers degrade to
 * answering from the DB tools + base prompt alone.
 */
export async function retrieveKnowledge(
  query: string,
  topK = 5,
): Promise<KnowledgeChunk[]> {
  if (index.chunks.length === 0) return [];

  // Use the index's own model so query vectors match the stored document
  // vectors (the model is recorded when the index is built).
  const queryVec = await embedText(
    query,
    "RETRIEVAL_QUERY",
    index.dimension,
    index.model,
  );

  return index.chunks
    .map((chunk) => ({
      id: chunk.id,
      source: chunk.source,
      title: chunk.title,
      text: chunk.text,
      score: dot(queryVec, chunk.embedding),
    }))
    .filter((chunk) => chunk.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
