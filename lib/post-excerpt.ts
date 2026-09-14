const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

const NUMERIC_ENTITY = /^&#(x[0-9a-f]+|[0-9]+);$/i;

function isValidCodePoint(codePoint: number): boolean {
  return (
    Number.isInteger(codePoint) &&
    codePoint > 0 &&
    codePoint <= 0x10ffff &&
    // Lone surrogates are not characters; String.fromCodePoint accepts them
    // but the result is unpaired garbage in the description.
    (codePoint < 0xd800 || codePoint > 0xdfff)
  );
}

/** Named entities win; numeric ones (decimal or hex) decode when in range. */
function decodeEntity(entity: string): string {
  const named = HTML_ENTITIES[entity.toLowerCase()];
  if (named !== undefined) {
    return named;
  }

  const numeric = NUMERIC_ENTITY.exec(entity);
  if (numeric !== null) {
    const digits = numeric[1];
    const isHex = digits[0].toLowerCase() === "x";
    const codePoint = isHex
      ? Number.parseInt(digits.slice(1), 16)
      : Number.parseInt(digits, 10);
    if (isValidCodePoint(codePoint)) {
      return String.fromCodePoint(codePoint);
    }
  }

  return " ";
}

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
    .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, decodeEntity)
    .replace(/\s+/g, " ")
    .trim();

  const characters = [...text];
  if (characters.length <= maxLength) {
    return text;
  }
  return `${characters.slice(0, maxLength).join("")}…`;
}
