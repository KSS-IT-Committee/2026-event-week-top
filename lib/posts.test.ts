import { describe, expect, it, vi } from "vitest";

import { getAllPosts, getPostById } from "@/lib/posts";

const FIXTURE = vi.hoisted(() => [
  {
    slug: "post-feb",
    id: "post-feb",
    title: "February Post",
    date: "2026-02-01T09:00:00.000Z",
    tag: "sport",
    internal: false,
    roles: [] as string[],
    content: "# Feb body\n\nSome content.",
    contentHtml: "<h1>Feb body</h1><p>Some content.</p>",
  },
  {
    slug: "post-jan",
    id: "post-jan",
    title: "January Post",
    date: "2026-01-15T12:30:00.000Z",
    tag: "info",
    internal: true,
    roles: [] as string[],
    content: "",
    contentHtml: "",
  },
  {
    slug: "post-mar",
    id: "post-mar",
    title: "March Post",
    date: "2026-03-20T18:45:00.000Z",
    tag: "art",
    internal: false,
    roles: ["IT"] as string[],
    content: "March content",
    contentHtml: "<p>March content</p>",
  },
]);

vi.mock("@/lib/posts.generated.json", () => ({ default: FIXTURE }));
vi.mock("./posts.generated.json", () => ({ default: FIXTURE }));

describe("getAllPosts", () => {
  it("maps each post to { id: slug, title, date, tag }", () => {
    const result = getAllPosts();

    expect(result).toEqual([
      {
        id: "post-feb",
        title: "February Post",
        date: "2026-02-01T09:00:00.000Z",
        tag: "sport",
      },
      {
        id: "post-jan",
        title: "January Post",
        date: "2026-01-15T12:30:00.000Z",
        tag: "info",
      },
      {
        id: "post-mar",
        title: "March Post",
        date: "2026-03-20T18:45:00.000Z",
        tag: "art",
      },
    ]);
  });

  it("preserves fixture order and length", () => {
    const result = getAllPosts();

    expect(result).toHaveLength(FIXTURE.length);
    expect(result.map((post) => post.id)).toEqual([
      "post-feb",
      "post-jan",
      "post-mar",
    ]);
  });

  it("sets id equal to the source slug for every post", () => {
    const result = getAllPosts();

    result.forEach((post, index) => {
      expect(post.id).toBe(FIXTURE[index].slug);
    });
  });

  it("does not include content or contentHtml fields", () => {
    const result = getAllPosts();

    result.forEach((post) => {
      expect(Object.keys(post).sort()).toEqual(
        ["date", "id", "tag", "title"].sort(),
      );
    });
  });
});

describe("getPostById", () => {
  it("resolves to { id: slug, contentHtml, title, date, internal, roles } for an existing post", async () => {
    const post = await getPostById("post-feb");

    expect(post).toEqual({
      id: "post-feb",
      contentHtml: "<h1>Feb body</h1><p>Some content.</p>",
      title: "February Post",
      date: "2026-02-01T09:00:00.000Z",
      internal: false,
      roles: [],
    });
  });

  it("resolves a post whose content is empty", async () => {
    const post = await getPostById("post-jan");

    expect(post).toEqual({
      id: "post-jan",
      contentHtml: "",
      title: "January Post",
      date: "2026-01-15T12:30:00.000Z",
      internal: true,
      roles: [],
    });
  });

  it("does not include the tag field in the resolved post", async () => {
    const post = await getPostById("post-mar");

    expect(Object.keys(post).sort()).toEqual(
      ["contentHtml", "date", "id", "internal", "roles", "title"].sort(),
    );
  });

  it("rejects with an Error when the slug does not exist", async () => {
    await expect(getPostById("does-not-exist")).rejects.toThrow(
      "Post does-not-exist not found",
    );
  });

  it("rejects with an Error instance", async () => {
    await expect(getPostById("does-not-exist")).rejects.toBeInstanceOf(Error);
  });
});
