#!/usr/bin/env node
// Embeds the static knowledge corpus (content/knowledge/*.md and *.pdf) into a
// single lib/knowledge.generated.json at authoring time, NOT at build time.
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
// plain dot product. gemini-embedding-2 already returns unit vectors (even at a
// reduced outputDimensionality), so normalize() is an idempotent safety net that
// keeps this correct if the model is ever swapped for one that does not.

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
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(repoRoot, "content", "knowledge");
const OUT_FILE = join(repoRoot, "lib", "knowledge.generated.json");

// Keep these in sync with lib/knowledge.ts (it reads `model`/`dimension` from
// the artifact, but the query embedding must use the same model + dimension).
//
// gemini-embedding-2 is Gemini's natively multimodal embedding model (text /
// image / PDF / audio / video), which is why we moved off the text-only
// gemini-embedding-001 — it lets the corpus grow to include PDFs. NOTE: the two
// models' embedding spaces are INCOMPATIBLE, so changing this constant requires
// a full re-embed (`npm run knowledge`); a half-migrated artifact (v2 query
// vectors vs v1 document vectors) silently corrupts retrieval scores.
const EMBED_MODEL =
  process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-2-preview";
const DIMENSION = 768;
const MAX_CHARS = 1200; // target chunk size
const OVERLAP_CHARS = 150; // carry-over between chunks for context continuity
const BATCH_SIZE = 100; // chunks embedded per API call

const log = (msg) => console.log(`[knowledge] ${msg}`);

// gemini-embedding-2 dropped the taskType config field: it ignores taskType and
// the retrieval task must instead be prepended to the input as an instruction.
// Older models (gemini-embedding-001, still reachable via GEMINI_EMBED_MODEL)
// take taskType and must NOT receive the prefix. Keep this dual handling — and
// the exact instruction strings — in sync with lib/gemini.ts#embedText (the
// query-side encoder), so query and document vectors stay comparable.
const usesTaskInstruction = (model) => model.startsWith("gemini-embedding-2");

function embedDocInput(model, chunk) {
  return usesTaskInstruction(model)
    ? `title: ${chunk.title} | text: ${chunk.text}`
    : chunk.text;
}

function embedConfig(model) {
  return usesTaskInstruction(model)
    ? { outputDimensionality: DIMENSION }
    : { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: DIMENSION };
}

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

// PDFs are embedded one page at a time (the user-chosen "multimodal, per page"
// strategy): pdf-lib splits the file into single-page PDFs so every page gets
// its own vector, and unpdf pulls each page's text for the retrieved-evidence
// block shown to the chat model. The page bytes are embedded as inlineData
// (multimodal) but are NOT stored in the artifact — only the text + vector are.
async function splitPdfPages(bytes) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = [];
  for (let i = 0; i < src.getPageCount(); i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [i]);
    doc.addPage(page);
    pages.push(Buffer.from(await doc.save()));
  }
  return pages;
}

async function extractPdfPageTexts(bytes) {
  const proxy = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(proxy, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

async function pdfChunks(file) {
  const source = file.replace(/\.pdf$/, "");
  const bytes = readFileSync(join(SOURCE_DIR, file));
  const [pages, texts] = await Promise.all([
    splitPdfPages(bytes),
    extractPdfPageTexts(bytes),
  ]);
  return pages.map((pageBytes, i) => {
    const extracted = (texts[i] ?? "").replace(/\s+/g, " ").trim();
    return {
      kind: "pdf",
      id: `${source}#p${i + 1}`,
      source,
      title: `${source}（${i + 1}ページ目）`,
      // Evidence text the chat model quotes. Falls back to a marker when a page
      // has no extractable text (e.g. a scan) — the page is still retrievable
      // because the vector is over the rendered PDF, not this string.
      text:
        extracted ||
        `（${source} の ${i + 1} ページ目：抽出可能なテキストがありません）`,
      pdf: pageBytes.toString("base64"),
    };
  });
}

async function collectChunks() {
  if (!existsSync(SOURCE_DIR)) return [];
  const files = readdirSync(SOURCE_DIR)
    .filter(
      (f) =>
        (f.endsWith(".md") || f.endsWith(".pdf")) &&
        f !== "README.md" &&
        !f.startsWith("_"),
    )
    .sort();

  const chunks = [];
  for (const file of files) {
    if (file.endsWith(".pdf")) {
      chunks.push(...(await pdfChunks(file)));
      continue;
    }
    const raw = readFileSync(join(SOURCE_DIR, file), "utf8");
    const { data, content } = matter(raw);
    const source = file.replace(/\.md$/, "");
    const title = typeof data.title === "string" ? data.title : source;
    chunkBody(content).forEach((text, i) => {
      chunks.push({ kind: "text", id: `${source}#${i}`, source, title, text });
    });
  }
  return chunks;
}

// Validate the vector, drop the raw PDF bytes, and attach the normalized
// embedding. A dimension mismatch would silently corrupt retrieval scores
// (lib/knowledge.ts compares vectors over min(length)), so fail loudly here.
function finalizeChunk(chunk, values) {
  if (!values || values.length !== DIMENSION) {
    throw new Error(
      `bad embedding for chunk ${chunk.id}: expected ${DIMENSION} dims, ` +
        `got ${values?.length ?? 0}`,
    );
  }
  const out = { ...chunk, embedding: normalize(values) };
  delete out.pdf; // raw PDF bytes are never shipped in the artifact
  return out;
}

async function embedAll(ai, chunks) {
  const textChunks = chunks.filter((c) => c.kind !== "pdf");
  const pdfPageChunks = chunks.filter((c) => c.kind === "pdf");

  // PDF pages are embedded as inlineData, which only the multimodal v2 model
  // accepts; a text-only model (e.g. a gemini-embedding-001 override) would 400.
  if (pdfPageChunks.length > 0 && !usesTaskInstruction(EMBED_MODEL)) {
    throw new Error(
      `PDF sources require a multimodal embedding model (e.g. ` +
        `gemini-embedding-2-preview); ${EMBED_MODEL} is text-only`,
    );
  }

  const embedded = [];

  // Text chunks batch: BATCH_SIZE chunks in -> BATCH_SIZE vectors out per call.
  // Each chunk MUST be its own Content object ({ parts: [{ text }] }). A bare
  // array of strings is fused by gemini-embedding-2 into a SINGLE vector (one
  // input, many parts) rather than one-per-string, which then trips the
  // count-mismatch check below.
  for (let i = 0; i < textChunks.length; i += BATCH_SIZE) {
    const batch = textChunks.slice(i, i + BATCH_SIZE);
    const res = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: batch.map((c) => ({
        parts: [{ text: embedDocInput(EMBED_MODEL, c) }],
      })),
      config: embedConfig(EMBED_MODEL),
    });
    const embeddings = res.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      throw new Error(
        `embedding count mismatch: asked ${batch.length}, got ${embeddings.length}`,
      );
    }
    batch.forEach((chunk, j) =>
      embedded.push(finalizeChunk(chunk, embeddings[j]?.values)),
    );
    log(
      `embedded text ${Math.min(i + BATCH_SIZE, textChunks.length)}/${textChunks.length}`,
    );
  }

  // PDF pages: one request per page. Multiple inlineData parts in a single call
  // would fuse into one vector instead of one-per-page, so they can't be batched.
  for (let i = 0; i < pdfPageChunks.length; i++) {
    const chunk = pdfPageChunks[i];
    const res = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: [
        { inlineData: { mimeType: "application/pdf", data: chunk.pdf } },
      ],
      config: { outputDimensionality: DIMENSION },
    });
    embedded.push(finalizeChunk(chunk, res.embeddings?.[0]?.values));
    log(`embedded pdf ${i + 1}/${pdfPageChunks.length} (${chunk.id})`);
  }

  return embedded;
}

const chunks = await collectChunks();

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
