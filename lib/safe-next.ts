import "server-only";

/**
 * Resolve a caller-supplied `next` to a URL we are willing to send a user to,
 * or "/" when it isn't one. Shared by the /login server actions (which redirect
 * to it) and the /login page's cross-app return link (which renders it as an
 * href), so both apply the same allow-list. Reads SESSION_COOKIE_DOMAIN, a
 * server-only env var, so this must run on the server.
 */

// A satellite app (equipment.2026.kss-it.com, …) sends the user to the shared
// /login and wants them back afterwards, so we accept absolute https URLs whose
// host is in the SESSION_COOKIE_DOMAIN family — and nothing else. The whole
// `*.2026.kss-it.com` namespace is committee-controlled, so this isn't an open
// redirect; an unrelated host still falls back to "/".
function isAllowedReturnHost(host: string): boolean {
  const domain = process.env.SESSION_COOKIE_DOMAIN;
  if (!domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

export function safeNextPath(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";

  // Same-site relative path. Resolve against a sentinel origin and require it
  // to survive unchanged: a plain startsWith("/") check isn't enough because
  // browsers fold "\" to "/", so "/\evil.com" (and control chars, "//evil.com")
  // resolve to a foreign origin.
  if (value.startsWith("/")) {
    try {
      const url = new URL(value, "https://placeholder.invalid");
      if (url.origin !== "https://placeholder.invalid") return "/";
      return url.pathname + url.search + url.hash;
    } catch {
      return "/";
    }
  }

  // Absolute URL back to a sibling app under the 2026 namespace. A non-https
  // scheme (e.g. javascript:) never matches, so this can't render a dangerous
  // href.
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && isAllowedReturnHost(url.host)) {
      return url.toString();
    }
  } catch {
    // not a parseable absolute URL — fall through
  }
  return "/";
}
