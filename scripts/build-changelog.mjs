#!/usr/bin/env node
// Resolves a per-file add-date via `git log --diff-filter=A --follow` for each
// content/changelog/*.json entry, then emits a single lib/changelog.generated.json
// the /changelog page reads. Runs OUTSIDE the Docker build (where .git is absent);
// inside Docker this script keeps the previously-generated artifact untouched.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(repoRoot, "content", "changelog");
const OUT_FILE = join(repoRoot, "lib", "changelog.generated.json");

const log = (msg) => console.log(`[changelog] ${msg}`);

const hasGit = () => existsSync(join(repoRoot, ".git"));

function gitAddedAt(relPath) {
  try {
    const out = execFileSync(
      "git",
      ["log", "--diff-filter=A", "--follow", "--format=%aI", "--", relPath],
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
    if (!out) return null;
    const lines = out.split("\n");
    return lines[lines.length - 1] || null;
  } catch {
    return null;
  }
}

function writeArtifact(entries) {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(entries, null, 2) + "\n");
}

if (!existsSync(SOURCE_DIR)) {
  if (existsSync(OUT_FILE)) {
    log(`no sources at ${SOURCE_DIR}; keeping existing artifact`);
  } else {
    writeArtifact([]);
    log(`no sources at ${SOURCE_DIR}; wrote empty artifact`);
  }
  process.exit(0);
}

const gitAvailable = hasGit();
if (!gitAvailable && existsSync(OUT_FILE)) {
  log("no .git available (likely inside Docker); keeping existing artifact");
  process.exit(0);
}

const files = readdirSync(SOURCE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

const entries = files.map((file) => {
  const fullPath = join(SOURCE_DIR, file);
  const data = JSON.parse(readFileSync(fullPath, "utf8"));
  if (typeof data.title !== "string" || typeof data.description !== "string") {
    throw new Error(`[changelog] ${file}: missing title or description`);
  }
  const slug = file.replace(/\.json$/, "");
  const rel = `content/changelog/${file}`;
  let addedAt = gitAvailable ? gitAddedAt(rel) : null;
  if (!addedAt) {
    // Uncommitted (new entry on a feature branch before squash-merge) or no git
    // history available — fall back to mtime so dev previews still order sanely.
    addedAt = statSync(fullPath).mtime.toISOString();
  }
  return {
    slug,
    title: data.title,
    description: data.description,
    credits: Array.isArray(data.credits) ? data.credits : [],
    addedAt,
  };
});

entries.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
writeArtifact(entries);
log(
  `wrote ${entries.length} entr${entries.length === 1 ? "y" : "ies"} to ${OUT_FILE}`,
);
