#!/usr/bin/env node
// Score a query against the committed knowledge index and print the ranked
// cosine similarities — a calibration / debugging tool for retrieval.
//
// It mirrors lib/knowledge.ts#retrieveKnowledge exactly: embeds the query with
// the SAME model, dimension and task-instruction lib/gemini.ts#embedText uses,
// L2-normalizes, dot-products against every stored chunk (dot === cosine for
// unit vectors), and applies the per-modality MIN_SCORE so you can SEE which
// chunks pass — handy for re-tuning the thresholds as the corpus grows.
//
//   npx dotenv -e .env.local -- node scripts/retrieval-score.mjs "体育祭の点数は？"
//
// (dotenv supplies GEMINI_API_KEY, exactly like `npm run knowledge`.)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GoogleGenAI } from "@google/genai";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_FILE = join(repoRoot, "lib", "knowledge.generated.json");

// Keep in sync with lib/knowledge.ts (the runtime retriever's thresholds).
const MIN_SCORE = { text: 0.6, pdf: 0.5 };
const TOP_K = 10;

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error('usage: node scripts/retrieval-score.mjs "<query>"');
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error(
    "[score] GEMINI_API_KEY is not set. Run via:\n" +
      '  npx dotenv -e .env.local -- node scripts/retrieval-score.mjs "<query>"',
  );
  process.exit(1);
}

const index = JSON.parse(readFileSync(INDEX_FILE, "utf8"));
if (!index.chunks?.length) {
  console.error("[score] index is empty — run `npm run knowledge` first.");
  process.exit(1);
}

function normalize(values) {
  let norm = 0;
  for (const v of values) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return values.map((v) => v / norm);
}

function dot(a, b) {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}

// Embed the query exactly as lib/gemini.ts#embedText does for this index model.
async function embedQuery(ai, text) {
  const usesTaskInstruction = index.model.startsWith("gemini-embedding-2");
  const contents = usesTaskInstruction
    ? `task: search result | query: ${text}`
    : text;
  const config = usesTaskInstruction
    ? { outputDimensionality: index.dimension }
    : { taskType: "RETRIEVAL_QUERY", outputDimensionality: index.dimension };
  const res = await ai.models.embedContent({
    model: index.model,
    contents: [contents],
    config,
  });
  const values = res.embeddings?.[0]?.values;
  if (!values?.length) throw new Error("Gemini returned an empty embedding");
  return normalize(values);
}

const ai = new GoogleGenAI({ apiKey });
const queryVec = await embedQuery(ai, query);

const ranked = index.chunks
  .map((chunk) => {
    const kind = chunk.kind ?? "text";
    const score = dot(queryVec, chunk.embedding);
    return { kind, id: chunk.id, title: chunk.title, score };
  })
  .sort((a, b) => b.score - a.score);

console.log(`\nquery:  ${query}`);
console.log(
  `index:  ${index.model}  dim=${index.dimension}  chunks=${index.chunkCount}`,
);
console.log(
  `cutoff: text>=${MIN_SCORE.text}  pdf>=${MIN_SCORE.pdf}   (✓ = would be retrieved)\n`,
);
for (const row of ranked.slice(0, TOP_K)) {
  const mark = row.score >= MIN_SCORE[row.kind] ? "✓" : " ";
  console.log(
    `  ${mark} ${row.score.toFixed(3)}  [${row.kind.padEnd(4)}] ${row.id}  —  ${row.title}`,
  );
}
const passing = ranked.filter((r) => r.score >= MIN_SCORE[r.kind]).length;
console.log(
  `\n${passing} of ${ranked.length} chunk(s) pass the threshold (top ${Math.min(TOP_K, ranked.length)} shown).`,
);
