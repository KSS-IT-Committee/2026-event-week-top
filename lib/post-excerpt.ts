const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/**
 * A plain-text summary of a rendered post, for its <meta name="description">
 * and og:description. Works off the rendered HTML rather than the markdown
 * source so the post's own body (getPostById already returns contentHtml) is
 * the single source — no second markdown parse, and headings/links contribute
 * their text instead of their syntax.
 *
 * Counting is by code point, so the cut never splits a surrogate pair.
 */
export function postExcerpt(contentHtml: string, maxLength = 110): string {
  const text = contentHtml
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&[a-z]+;|&#\d+;/gi,
      (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  const characters = [...text];
  if (characters.length <= maxLength) {
    return text;
  }
  return `${characters.slice(0, maxLength).join("")}…`;
}
