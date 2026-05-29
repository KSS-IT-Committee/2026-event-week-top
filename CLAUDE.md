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
npm run dev          # predev runs the changelog generator, then `next dev`
npm run build        # prebuild runs the changelog generator, then `next build`
npm run start        # `drizzle-kit migrate` THEN `next start` — needs DATABASE_URL
npm run lint         # ESLint (also: lint:fix)
npm run format:check # Prettier check  (also: format to write)
npm run changelog    # Regenerate lib/changelog.generated.json from content/changelog/*.json
npx tsc --noEmit     # Type check (CI runs this; there is no npm script wrapper)
```

The `pre*` hooks mean you almost never invoke `npm run changelog` manually — `dev` and `build` already do it. The exception is when `tsc --noEmit` is run standalone: `app/changelog/page.tsx` statically imports the generated JSON, so tsc fails if the artifact is missing. Run `npm run changelog` first in that case (this is exactly what CI does before `tsc`).

`DATABASE_URL` is required for `npm run start` (migrate step) and for any code path that touches `lib/db.ts`. It's not needed for `dev` / `build` unless you exercise DB code.

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

### Database access

`lib/db.ts` exports `db` as a lazy Proxy that constructs the Drizzle client on first property access. Reasons it's written this way:

- `import "server-only"` — importing this module from a client component is a build error.
- A single `postgres()` pool (`max: 10`) is stashed on `globalThis.pgClient` in non-production so HMR doesn't leak connections across reloads.
- `DATABASE_URL` is read lazily, so importing the module without using it doesn't crash on missing env.

If you add a new table: edit `db/schema.ts`, then `npx drizzle-kit generate` to create a new SQL file under `drizzle/`. Production applies migrations on container start via the `npm run start` script.

### Docker / preview

`Dockerfile` mirrors the production VPS runtime (`2026-server-ansible/roles/apps/templates/Dockerfile.nextjs.j2`). `scripts/preview.sh` pulls the published `ghcr.io/<repo>/preview:<tag>` image and brings up `docker-compose.preview.yml` (Postgres + app) on `localhost:3000`. Don't edit the Dockerfile to diverge from the ansible template without coordinating with that repo.

## Code style

`docs/CODE-STYLE.md` is the canonical reference (Japanese version: `docs/CODE-STYLE-ja.md`). The points the linter does **not** auto-enforce, and that matter for review:

- **Function declarations**, not arrow functions, for React components.
- **Named exports** for components and utilities. `default export` only for App Router special files (`page.tsx`, `layout.tsx`, `not-found.tsx`, etc.) where Next.js requires it.
- **Boolean variables prefixed `is` / `has` / `can`.**
- **Strict equality** (`===` / `!==`) always.

The linter **does** enforce: import ordering (`simple-import-sort`), no unused imports (`unused-imports/no-unused-imports`), Next.js core-web-vitals + TS rules. Prettier config (`.prettierrc`) is double quotes, semis, trailing commas everywhere, 80-col, 2-space.
