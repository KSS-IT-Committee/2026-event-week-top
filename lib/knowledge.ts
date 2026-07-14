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

type ChunkKind = "text" | "pdf";

type StoredChunk = {
  // Older artifacts predate this field; treat a missing kind as "text".
  kind?: ChunkKind;
  id: string;
  source: string;
  title: string;
  text: string;
  // Optional document-level note (e.g. "this is last year's reference") copied
  // onto every chunk so chunking can't strip it. Shown to the model, not embedded.
  context?: string;
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
  context?: string;
  score: number;
};

const index = knowledgeIndex as KnowledgeIndex;

// Discard weak matches so an off-topic question doesn't drag in unrelated text.
// These thresholds are MODEL- AND MODALITY-specific. gemini-embedding-2 has a
// markedly higher cosine floor than gemini-embedding-001 did, and a text query
// scores LOWER against a PDF-page vector than against a text vector (the
// embedding "modality gap"). Measured against the current corpus: text docs
// separate around ~0.6 (off-topic ~0.55, on-topic ~0.63–0.73) while text→PDF
// hits run ~0.5 (off-topic ~0.38, on-topic ~0.57–0.62). A single cutoff can't
// serve both, so each modality gets its own. Re-tune when real content lands or
// `index.model` changes.
const MIN_SCORE: Record<ChunkKind, number> = { text: 0.6, pdf: 0.5 };

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
    .map((chunk) => ({ chunk, score: dot(queryVec, chunk.embedding) }))
    .filter(({ chunk, score }) => score >= MIN_SCORE[chunk.kind ?? "text"])
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk, score }) => ({
      id: chunk.id,
      source: chunk.source,
      title: chunk.title,
      text: chunk.text,
      context: chunk.context,
      score,
    }));
}
