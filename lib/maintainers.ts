/**
 * GitHub accounts shown as maintainers on /requests.
 *
 * Also the allowlist for next.config.ts's image `remotePatterns`: the only
 * remote images this app loads are these accounts' avatars, so the optimizer
 * is pinned to exactly these paths rather than all of `github.com/*.png`.
 * Without that, `/_next/image` would fetch and transcode any GitHub avatar on
 * request. Add a maintainer here and both the page and the allowlist follow.
 */
export const MAINTAINERS = [
  "karencaya",
  "kinoto0103",
  "mochi-k18",
  "utsukushiioto0816-tech",
] as const;

export function maintainerAvatarUrl(username: string): string {
  return `https://github.com/${username}.png`;
}
