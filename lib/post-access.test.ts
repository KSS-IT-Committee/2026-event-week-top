import { describe, expect, it } from "vitest";

import {
  canViewPost,
  isRestrictedPost,
  type PostVisibility,
} from "@/lib/post-access";

function makePost(overrides: Partial<PostVisibility> = {}): PostVisibility {
  return { internal: false, roles: [], ...overrides };
}

describe("isRestrictedPost", () => {
  it("treats a post without visibility frontmatter as public", () => {
    expect(isRestrictedPost(makePost())).toBe(false);
  });

  it("treats internal: true as restricted", () => {
    expect(isRestrictedPost(makePost({ internal: true }))).toBe(true);
  });

  it("treats a non-empty roles list as restricted", () => {
    expect(isRestrictedPost(makePost({ roles: ["IT"] }))).toBe(true);
  });
});

describe("canViewPost — public posts", () => {
  it("is visible to anonymous viewers", () => {
    expect(canViewPost(null, makePost())).toBe(true);
  });

  it("is visible to logged-in viewers regardless of roles", () => {
    expect(canViewPost({ roles: [] }, makePost())).toBe(true);
    expect(canViewPost({ roles: ["IT"] }, makePost())).toBe(true);
  });
});

describe("canViewPost — internal posts", () => {
  const post = makePost({ internal: true });

  it("is hidden from anonymous viewers", () => {
    expect(canViewPost(null, post)).toBe(false);
  });

  it("is hidden from a logged-in viewer with no roles", () => {
    expect(canViewPost({ roles: [] }, post)).toBe(false);
  });

  it("is visible to Students and Teachers (INTERNAL_ROLES)", () => {
    expect(canViewPost({ roles: ["Students"] }, post)).toBe(true);
    expect(canViewPost({ roles: ["Teachers"] }, post)).toBe(true);
  });

  it("is hidden from a viewer holding only non-internal roles", () => {
    expect(canViewPost({ roles: ["IT"] }, post)).toBe(false);
  });
});

describe("canViewPost — role-restricted posts", () => {
  const post = makePost({ roles: ["IT", "Sousakuten"] });

  it("is hidden from anonymous viewers", () => {
    expect(canViewPost(null, post)).toBe(false);
  });

  it("is visible to a viewer holding any listed role", () => {
    expect(canViewPost({ roles: ["IT"] }, post)).toBe(true);
    expect(canViewPost({ roles: ["Sousakuten", "Students"] }, post)).toBe(true);
  });

  it("is hidden from a viewer holding none of the listed roles", () => {
    expect(canViewPost({ roles: ["Students", "Teachers"] }, post)).toBe(false);
  });

  it("unions with internal: true — either internal or listed roles admit", () => {
    const both = makePost({ internal: true, roles: ["IT"] });

    expect(canViewPost({ roles: ["Students"] }, both)).toBe(true);
    expect(canViewPost({ roles: ["IT"] }, both)).toBe(true);
    expect(canViewPost({ roles: ["G1"] }, both)).toBe(false);
  });

  it("fails closed on a role name that matches nothing (frontmatter typo)", () => {
    const typo = makePost({ roles: ["students"] });

    expect(canViewPost(null, typo)).toBe(false);
    expect(canViewPost({ roles: ["Students"] }, typo)).toBe(false);
    expect(canViewPost({ roles: ["IT"] }, typo)).toBe(false);
  });
});
