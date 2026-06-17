# content/knowledge

The static knowledge base for the `/chat` event assistant. Drop Markdown files
here; each becomes part of the chatbot's retrievable context.

## How it works

1. Add a `*.md` file (optionally with `title:` frontmatter).
2. Run `npm run knowledge` — it chunks every file, embeds each chunk with
   Gemini (`gemini-embedding-001`, 768-d, L2-normalized), and writes
   `lib/knowledge.generated.json`.
3. **Commit `lib/knowledge.generated.json`** along with your source file.

At request time `lib/knowledge.ts` embeds the user's question and returns the
most similar chunks (cosine similarity) to ground the answer.

## Notes

- `README.md` and files starting with `_` are ignored by the indexer.
- The generated JSON is committed on purpose (unlike the changelog/posts
  artifacts) so `npm run build` and CI never need `GEMINI_API_KEY`.
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
