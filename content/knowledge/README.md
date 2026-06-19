# content/knowledge

The static knowledge base for the `/chat` event assistant. Drop Markdown **or
PDF** files here; each becomes part of the chatbot's retrievable context.

## How it works

1. Add a `*.md` file (optionally with `title:` frontmatter) or a `*.pdf` file.
2. Run `npm run knowledge` — it embeds each source with the multimodal Gemini
   model (`gemini-embedding-2-preview`, 768-d, L2-normalized) and writes
   `lib/knowledge.generated.json`:
   - **Markdown** is chunked by paragraph (~1200 chars).
   - **PDF** is embedded **one page per vector** (the page's rendered bytes go
     to the model, so tables / figures / scans are captured), and that page's
     extracted text is stored as the quotable evidence.
3. **Commit `lib/knowledge.generated.json`** along with your source file.

At request time `lib/knowledge.ts` embeds the user's question and returns the
most similar chunks (cosine similarity) to ground the answer. A text question
can match a PDF page (cross-modal retrieval).

## Notes

- `README.md` and files starting with `_` are ignored by the indexer.
- PDFs require the multimodal embedding model (the default); a text-only
  `GEMINI_EMBED_MODEL` override will make the build fail loudly if any PDF is
  present.
- The generated JSON is committed on purpose (unlike the changelog/posts
  artifacts) so `npm run build` and CI never need `GEMINI_API_KEY`.
- The raw PDF bytes are **not** stored in the artifact — only the per-page
  vector and extracted text — so it stays small.
- This is "massive text" friendly up to a few thousand chunks (~MBs). If the
  corpus grows past that, graduate to pgvector in the shared `appdata` DB
  (see the chat plan / lib/knowledge.ts comment).

## Frontmatter

```markdown
---
title: 創作展について
---

本文をここに書く。空行で区切った段落ごとにチャンク化されます。
```
