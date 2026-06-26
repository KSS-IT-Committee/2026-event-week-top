# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The warning above is not boilerplate — Next.js 16 + React 19 are used here, and several App Router APIs differ from older versions. When touching framework surfaces (route handlers, layouts, metadata, caching, fonts, middleware), read the relevant doc in `node_modules/next/dist/docs/` before writing code.

## Stack

- **Next.js 16** (App Router) on **React 19**, TypeScript strict, `@/*` aliased to the repo root.
- **Postgres** accessed via **Drizzle ORM** (`postgres-js` driver). Schema in `db/schema.ts`, migrations in `drizzle/`, kit config in `drizzle.config.ts`.
- **Tailwind CSS v4** via `@tailwindcss/postcss` plus per-component **CSS Modules** (`*.module.css`).
- **No test runner is configured.** CI has a `test` job that no-ops when no `test` script exists — don't claim "tests pass" by running this; there are none.

## Commands

```bash
npm run dev          # predev runs the changelog + posts generators, then `next dev`
npm run build        # prebuild runs the changelog + posts generators, then `next build`
npm run start        # `next start` only — this app does NOT migrate (2026-db is the sole migrator)
npm run lint         # ESLint (also: lint:fix)
npm run format:check # Prettier check  (also: format to write)
npm run changelog    # Regenerate lib/changelog.generated.json from content/changelog/*.json
npx tsc --noEmit     # Type check (CI runs this; there is no npm script wrapper)
```

The `pre*` hooks mean you almost never invoke `npm run changelog` manually — `dev` and `build` already do it. The exception is when `tsc --noEmit` is run standalone: `app/changelog/page.tsx` statically imports the generated JSON, so tsc fails if the artifact is missing. Run `npm run changelog` first in that case (this is exactly what CI does before `tsc`).

`DATABASE_URL` is required at runtime (`npm run start`) and for any code path that touches `lib/db.ts`. It's not needed for `dev` / `build` unless you exercise DB code.

### Shared login (env vars)

The `/login` page and `lib/session.ts` implement a credentials login whose session is shared across every app under `2026.kss-it.com`. Two non-secret runtime env vars tune it (production sets them via `2026-server-ansible`'s `app_shared_env`):

- `SESSION_COOKIE_DOMAIN` — cookie `Domain` (prod: `2026.kss-it.com`, so all four apps + PR previews share one login). **Leave it unset for local dev / vvps** — a host-only cookie on `127.0.0.1` is still sent across ports, so cross-app login keeps working locally.
- `SESSION_TTL_SECONDS` — session lifetime, default `172800` (2 days). Expiry slides on access (`proxy.ts` re-stamps the cookie; `lib/session.ts` renews the DB row).

Beyond first login, `/login` also hosts a **self-service password change** (`changePasswordAction`): it self-authorizes from the session (never from form input), re-verifies the current password, then in one transaction rewrites the bcrypt hash and **revokes every session for that account** (logout across all apps via the shared `sessions` table) before re-issuing one for the current device. `users.has_logged_in` latches `true` on first login. Login and password-change are rate-limited per-**username** (not IP — the school is behind one NAT) via `lib/rate-limit.ts`, and post-login redirects pass through `lib/safe-next.ts` (open-redirect guard confined to the `SESSION_COOKIE_DOMAIN` host family).

`lib/session-cookie.ts`, `lib/session.ts`, `proxy.ts`, `lib/access.ts`, and `lib/user-category.ts` are **byte-identical across all four app repos** (as are the shared `AuthGuard` / `AccountNav` components) — see the root `CLAUDE.md` footgun list. Edit once, copy to the others, verify with `sha256sum`.

## Architecture

### Changelog pipeline (the non-obvious bit)

The `/changelog` page is **statically generated from content + git history**, not from a database:

1. Each entry is a JSON file in `content/changelog/` (e.g. `0003-changelog.json` with `title` / `description` / `credits`).
2. `scripts/build-changelog.mjs` (run via `predev` / `prebuild`) walks each file with `git log --diff-filter=A --first-parent` against `origin/main` → `main` → `HEAD`, picks the oldest commit that added the file, and emits `lib/changelog.generated.json` with `{slug, title, description, credits, addedAt, commit}`.
3. `app/changelog/page.tsx` statically imports that JSON. The `commit` field links to `github.com/KSS-IT-Committee/2026-event-week-top/commit/<sha>`.

Consequences:

- **CI must use `fetch-depth: 0`** (it does — see `ci.yml` / `build-check.yml`). A shallow clone makes the script silently fall back to `mtime`.
- **Inside Docker the script no-ops** when `.git` is absent and a prior artifact exists; the Dockerfile copies the artifact from the host build context. `.dockerignore` whitelists `scripts/build-changelog.mjs` for the same reason.
- Adding a changelog entry = drop a new `NNNN-changelog.json` in `content/changelog/`. Don't hand-edit `lib/changelog.generated.json`; it's regenerated and gitignored.

### Posts / news pipeline

A second content pipeline mirrors the changelog: `scripts/build-posts.mjs` (also run by `predev` / `prebuild`) renders `content/posts/*.md` — frontmatter via `gray-matter`, body via `remark` — into the gitignored `lib/posts.generated.json`, statically imported by `lib/posts.ts` and rendered at `/news`, `/news/list`, `/news/[id]` (also surfaced to the chat via its `get_recent_news` tool). Adding news = drop a new markdown file in `content/posts/`; like the changelog, never hand-edit the generated JSON.

### Database access

`lib/db.ts` exports `db` as a lazy Proxy that constructs the Drizzle client on first property access. Reasons it's written this way:

- `import "server-only"` — importing this module from a client component is a build error.
- A single `postgres()` pool (`max: 10`) is stashed on `globalThis.pgClient` in non-production so HMR doesn't leak connections across reloads.
- `DATABASE_URL` is read lazily, so importing the module without using it doesn't crash on missing env.

If you add or change a table: edit `db/schema.ts` **here and in `2026-db`** (the canonical schema), generate the migration **in `2026-db`** (`npx drizzle-kit generate`), and keep the change additive. This app's `drizzle/` output is **dev-only** and must never run against `appdata` — `npm run start` is `next start` only; `2026-db` is the sole migrator. App-local migrations exist for local Drizzle tooling, not deployment.

### Chat / RAG (`/chat`, `/api/chat`)

`/api/chat` streams a Gemini agentic loop (`lib/chat.ts`, ≤5 tool iterations) that first retrieves from the committed knowledge corpus. Invariants worth preserving:

- **Tools are read-only and class-scoped from the session.** `lib/chat-tools.ts` exposes only read tools (announcements / equipment availability / deductions / recent news); the viewer's class comes from `classOf(session.username)` server-side, **never** from a model argument — that is what makes it prompt-injection-safe. Keep any new tool read-only and session-scoped.
- **Model pool + mid-stream failover.** `lib/gemini.ts` defines `CHAT_MODELS` (quality-ordered, with a per-model cooldown that honors the API `retryDelay`); `GEMINI_MODEL` pins a single model. On a 429/503 _after_ partial text has already streamed, the loop emits `CHAT_RESET_SIGNAL` (U+E000, `lib/chat-protocol.ts` — deliberately not `server-only`, since the browser shares it) so the client discards the partial and the next model re-answers cleanly.
- **Rate limits.** Per-user 15/min plus a per-instance global ceiling `CHAT_GLOBAL_RATE_LIMIT` (default 600/min), via `lib/rate-limit.ts`.
- **Embeddings must match the corpus.** `lib/knowledge.ts` brute-force cosine-scans `lib/knowledge.generated.json`; query embeddings (`lib/gemini.ts#embedText`) must use the exact `model` recorded in that index — re-embedding the corpus and changing the query model must happen together.

### Docker / preview

`Dockerfile` mirrors the production VPS runtime (`2026-server-ansible/roles/apps/templates/Dockerfile.nextjs.j2`) and builds the `output: "standalone"` bundle (`CMD ["node","server.js"]`). `scripts/preview.sh [tag]` pulls `ghcr.io/<repo>/preview:<tag>` when given a tag, otherwise **builds** the image from the working tree, then brings up `docker-compose.preview.yml` on `127.0.0.1:3000`. That compose runs three services: Postgres, the **`2026-db` migrator image** (applies the canonical schema), and the app. Don't edit the Dockerfile to diverge from the ansible template without coordinating with that repo.

## Code style

`docs/CODE-STYLE.md` is the canonical reference (Japanese version: `docs/CODE-STYLE-ja.md`). The points the linter does **not** auto-enforce, and that matter for review:

- **Function declarations**, not arrow functions, for React components.
- **Named exports** for components and utilities. `default export` only for App Router special files (`page.tsx`, `layout.tsx`, `not-found.tsx`, etc.) where Next.js requires it.
- **Boolean variables prefixed `is` / `has` / `can`.**
- **Strict equality** (`===` / `!==`) always.

The linter **does** enforce: import ordering (`simple-import-sort`), no unused imports (`unused-imports/no-unused-imports`), Next.js core-web-vitals + TS rules. Prettier config (`.prettierrc`) is double quotes, semis, trailing commas everywhere, 80-col, 2-space.
