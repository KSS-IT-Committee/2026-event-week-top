#!/usr/bin/env node
// Renders content/posts/*.md (frontmatter + markdown body) into a single
// lib/posts.generated.json at build time. The Docker runner stage ships only
// the build output — not content/ — so the news pages must never read the
// markdown from disk at runtime; they statically import this artifact instead.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import matter from "gray-matter";
import { remark } from "remark";
import gfm from "remark-gfm";
import html from "remark-html";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(repoRoot, "content", "posts");
const OUT_FILE = join(repoRoot, "lib", "posts.generated.json");

const log = (msg) => console.log(`[posts] ${msg}`);

function writeArtifact(posts) {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(posts, null, 2) + "\n");
}

if (!existsSync(SOURCE_DIR)) {
  writeArtifact([]);
  log(`no sources at ${SOURCE_DIR}; wrote empty artifact`);
  process.exit(0);
}

const files = readdirSync(SOURCE_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();

// Optional visibility frontmatter (lib/post-access.ts interprets it):
// `internal: true` limits a post to logged-in school accounts, `roles: [...]`
// to holders of at least one listed role. Only the shape is validated here —
// role NAMES are checked against ROLENAMES by test/content-posts.test.ts, so
// this script doesn't carry its own copy of the role list.
function readVisibility(file, data) {
  if (data.internal !== undefined && typeof data.internal !== "boolean") {
    throw new Error(
      `[posts] ${file}: frontmatter 'internal' must be a boolean`,
    );
  }
  const roles = data.roles ?? [];
  if (!Array.isArray(roles) || roles.some((r) => typeof r !== "string")) {
    throw new Error(
      `[posts] ${file}: frontmatter 'roles' must be an array of strings`,
    );
  }
  return { internal: data.internal === true, roles };
}

const posts = await Promise.all(
  files.map(async (file) => {
    const raw = readFileSync(join(SOURCE_DIR, file), "utf8");
    const { data, content } = matter(raw);
    if (!data.title || !data.date) {
      throw new Error(
        `[posts] ${file}: missing required frontmatter: title or date`,
      );
    }
    const slug = file.replace(/\.md$/, "");
    const contentHtml = String(
      await remark().use(gfm).use(html).process(content),
    );
    return {
      slug,
      id: typeof data.id === "string" ? data.id : slug,
      title: data.title,
      date: new Date(data.date).toISOString(),
      tag: typeof data.tag === "string" ? data.tag : "",
      ...readVisibility(file, data),
      content,
      contentHtml,
    };
  }),
);

writeArtifact(posts);
log(
  `wrote ${posts.length} post${posts.length === 1 ? "" : "s"} to ${OUT_FILE}`,
);
