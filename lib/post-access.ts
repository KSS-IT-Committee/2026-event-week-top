import "server-only";

import { INTERNAL_ROLES } from "@/lib/access";
import type { SessionUser } from "@/lib/session";

/**
 * Visibility frontmatter carried on every post in lib/posts.generated.json
 * (normalized by scripts/build-posts.mjs). `internal: true` restricts a post
 * to logged-in school accounts (INTERNAL_ROLES); `roles` restricts it to
 * holders of at least one listed role; both together union. Neither → public.
 */
export type PostVisibility = {
  internal: boolean;
  roles: string[];
};

/**
 * Whoever is looking at the news: a logged-in user's session (only the roles
 * matter — access is never decided from the username) or null for anonymous
 * visitors. SessionUser and the chat's ChatViewer both satisfy this shape.
 */
export type PostViewer = Pick<SessionUser, "roles"> | null;

// All roles a viewer may hold to see the post; empty means public.
function requiredRoles(post: PostVisibility): string[] {
  return [...(post.internal ? INTERNAL_ROLES : []), ...post.roles];
}

/**
 * Whether the post carries any visibility restriction. Pages use this to
 * skip the per-request session DB lookup for public posts.
 */
export function isRestrictedPost(post: PostVisibility): boolean {
  return requiredRoles(post).length > 0;
}

/**
 * Whether `viewer` may see `post`. Deny-by-default, mirroring lib/access.ts:
 * a restricted post is hidden from anonymous visitors and from logged-in
 * users holding none of the required roles. A role name that matches nothing
 * in the DB enum (e.g. a frontmatter typo) can never match a viewer, so a
 * misspelled restriction hides the post from everyone rather than exposing it
 * (test/content-posts.test.ts catches such typos in CI).
 */
export function canViewPost(viewer: PostViewer, post: PostVisibility): boolean {
  const required = requiredRoles(post);
  if (required.length === 0) return true;
  if (viewer === null) return false;
  return required.some((role) => viewer.roles.includes(role));
}
