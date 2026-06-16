#!/usr/bin/env node
// Embeds the static knowledge corpus (content/knowledge/*.md) into a single
// lib/knowledge.generated.json at authoring time, NOT at build time.
//
// Unlike the changelog/posts artifacts, this one is COMMITTED to git: it is
// produced by a paid Gemini embeddings call, so we never want `npm run build`
// or CI to regenerate it (that would need GEMINI_API_KEY at build time and
// re-bill on every build). Regenerate it manually with `npm run knowledge`
// whenever the corpus changes, then commit the result. The runtime retriever
// (lib/knowledge.ts) statically imports the artifact, so the Docker runner
// ships it without ever reading content/ at runtime.
//
// Vectors are L2-normalized here so the retriever's cosine similarity is a
// plain dot product. gemini-embedding-001 only pre-normalizes its full 3072-d
// output; a reduced outputDimensionality must be normalized by the caller.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GoogleGenAI } from "@google/genai";
import matter from "gray-matter";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(repoRoot, "content", "knowledge");
const OUT_FILE = join(repoRoot, "lib", "knowledge.generated.json");

// Keep these in sync with lib/knowledge.ts (it reads `model`/`dimension` from
// the artifact, but the query embedding must use the same model + dimension).
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";
const DIMENSION = 768;
const MAX_CHARS = 1200; // target chunk size
const OVERLAP_CHARS = 150; // carry-over between chunks for context continuity
const BATCH_SIZE = 100; // chunks embedded per API call

const log = (msg) => console.log(`[knowledge] ${msg}`);

function writeArtifact(chunks) {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const artifact = {
    model: EMBED_MODEL,
    dimension: DIMENSION,
    chunkCount: chunks.length,
    chunks,
  };
  writeFileSync(OUT_FILE, JSON.stringify(artifact, null, 2) + "\n");
}

// Greedily pack blank-line-separated paragraphs into ~MAX_CHARS chunks, with a
// tail overlap so a fact split across a boundary still has surrounding context.
function chunkBody(body) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";
  for (const para of paragraphs) {
    if (current && current.length + para.length + 2 > MAX_CHARS) {
      chunks.push(current);
      const tail = OVERLAP_CHARS > 0 ? current.slice(-OVERLAP_CHARS) : "";
      current = tail ? `${tail}\n\n${para}` : para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Hard-split any single paragraph that blew past the budget on its own.
  const out = [];
  for (const chunk of chunks) {
    if (chunk.length <= MAX_CHARS * 1.5) {
      out.push(chunk);
      continue;
    }
    for (let i = 0; i < chunk.length; i += MAX_CHARS) {
      out.push(chunk.slice(i, i + MAX_CHARS));
    }
  }
  return out;
}

function normalize(values) {
  let norm = 0;
  for (const v of values) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return values.map((v) => v / norm);
}

function collectChunks() {
  if (!existsSync(SOURCE_DIR)) return [];
  const files = readdirSync(SOURCE_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md" && !f.startsWith("_"))
    .sort();

  const chunks = [];
  for (const file of files) {
    const raw = readFileSync(join(SOURCE_DIR, file), "utf8");
    const { data, content } = matter(raw);
    const source = file.replace(/\.md$/, "");
    const title = typeof data.title === "string" ? data.title : source;
    chunkBody(content).forEach((text, i) => {
      chunks.push({ id: `${source}#${i}`, source, title, text });
    });
  }
  return chunks;
}

async function embedAll(ai, chunks) {
  const embedded = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const res = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: batch.map((c) => c.text),
      config: {
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: DIMENSION,
      },
    });
    const embeddings = res.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      throw new Error(
        `embedding count mismatch: asked ${batch.length}, got ${embeddings.length}`,
      );
    }
    batch.forEach((chunk, j) => {
      const values = embeddings[j]?.values;
      if (!values || values.length === 0) {
        throw new Error(`empty embedding for chunk ${chunk.id}`);
      }
      embedded.push({ ...chunk, embedding: normalize(values) });
    });
    log(`embedded ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}`);
  }
  return embedded;
}

const chunks = collectChunks();

// No corpus yet (or none after filtering): write an empty artifact and stop
// BEFORE requiring an API key, so a fresh checkout can build the empty index.
if (chunks.length === 0) {
  writeArtifact([]);
  log(`no sources at ${SOURCE_DIR}; wrote empty index`);
  process.exit(0);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error(
    "[knowledge] GEMINI_API_KEY is not set. Add it to .env.local (npm run " +
      "knowledge loads it via dotenv) before regenerating the index.",
  );
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const embedded = await embedAll(ai, chunks);
writeArtifact(embedded);
log(`wrote ${embedded.length} chunks to ${OUT_FILE}`);
