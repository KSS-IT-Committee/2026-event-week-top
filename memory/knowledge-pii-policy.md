---
name: knowledge-pii-policy
description: PII policy when reviewing content/knowledge/ PDFs before they go into the Gemini RAG corpus
metadata:
  type: feedback
---

When auditing `content/knowledge/` PDFs for personal information before embedding them
into the RAG chat corpus (`npm run knowledge`):

- **Individual student names tied to a class/identity MUST be redacted.** Example fixed:
  `【開拓部門】当日生徒マニュアル.pdf` had "5B 寺澤・5D 長部" on its last page; the user
  re-exported it masked as "******・******".
- **Committee/role-based email addresses are OK to keep** — the user decided
  `kss.sakuten93@gmail.com` (shared 創作展委員会 inbox, appears in 部活用 p.19/23 and
  クラス用 p.31/32/38) does NOT need redaction.
- Officer-intro sections (e.g. "16期創作展委員会幹部紹介") in the source PDFs already come
  with names masked as `*-* **** **`.

**Why:** distinguishes identifying PII (names) from acceptable institutional contact info.
**How to apply:** when checking remaining knowledge PDFs (立志部門, トラブル対応, etc.),
flag/redact personal names but leave the committee email alone.
