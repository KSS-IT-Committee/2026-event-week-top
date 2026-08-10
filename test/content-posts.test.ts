import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import matter from "gray-matter";
import { describe, expect, it } from "vitest";

import { ROLENAMES } from "@/db/schema";

/**
 * Validates the visibility frontmatter of the real posts in content/posts/.
 * canViewPost fails closed on a role name outside ROLENAMES, so a typo like
 * `roles: [students]` would silently hide the post from everyone — this test
 * turns that into a CI failure instead. scripts/build-posts.mjs only checks
 * the SHAPE of the fields (it can't import the TS schema), so the role-name
 * check lives here.
 */

const POSTS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "content",
  "posts",
);

const posts = readdirSync(POSTS_DIR)
  .filter((file) => file.endsWith(".md"))
  .map((file) => ({
    file,
    data: matter(readFileSync(join(POSTS_DIR, file), "utf8")).data,
  }));

describe("content/posts frontmatter", () => {
  it("finds at least one post to validate", () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  it.each(posts)("$file: 'internal' is a boolean when present", ({ data }) => {
    if (data.internal !== undefined) {
      expect(typeof data.internal).toBe("boolean");
    }
  });

  it.each(posts)(
    "$file: every entry in 'roles' is a known role name",
    ({ data }) => {
      if (data.roles === undefined) return;
      expect(Array.isArray(data.roles)).toBe(true);
      for (const role of data.roles as unknown[]) {
        expect(ROLENAMES).toContain(role);
      }
    },
  );
});
