import { describe, expect, it } from "vitest";

import { postExcerpt } from "@/lib/post-excerpt";

describe("postExcerpt", () => {
  it("strips tags and collapses the remaining text to one line", () => {
    expect(
      postExcerpt("<h1>見出し</h1>\n<p>本文です。</p>\n<p>二段落目。</p>"),
    ).toBe("見出し 本文です。 二段落目。");
  });

  it("decodes the entities remark-html emits", () => {
    expect(
      postExcerpt("<p>A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;</p>"),
    ).toBe(`A & B <C> "D" 'E'`);
  });

  it("decodes hexadecimal and decimal numeric references", () => {
    expect(postExcerpt("<p>a&#x2014;b &#8212; c &#X1F600;</p>")).toBe(
      "a—b — c 😀",
    );
  });

  it("replaces an out-of-range or surrogate numeric reference with a space", () => {
    expect(postExcerpt("<p>a&#x110000;b&#xD800;c&#0;d</p>")).toBe("a b c d");
  });

  it("replaces an entity it does not know with a space", () => {
    expect(postExcerpt("<p>a&hellip;b</p>")).toBe("a b");
  });

  it("returns text shorter than maxLength unchanged and without an ellipsis", () => {
    expect(postExcerpt("<p>短い本文</p>")).toBe("短い本文");
  });

  it("truncates at maxLength and appends an ellipsis", () => {
    expect(postExcerpt(`<p>${"あ".repeat(200)}</p>`, 10)).toBe(
      `${"あ".repeat(10)}…`,
    );
  });

  it("keeps text of exactly maxLength unchanged", () => {
    expect(postExcerpt(`<p>${"あ".repeat(10)}</p>`, 10)).toBe("あ".repeat(10));
  });

  it("counts by code point, so a surrogate pair is never split", () => {
    // Each emoji is two UTF-16 units; slicing by .length would cut one in half.
    expect(postExcerpt("<p>😀😀😀😀</p>", 2)).toBe("😀😀…");
  });

  it("returns an empty string for markup with no text", () => {
    expect(postExcerpt("<p></p>\n<br />")).toBe("");
  });
});
