// Class-scoping helper. Username-derived data is only used to scope WHAT a
// user sees (their own class's deductions, chat tools, lottery eligibility),
// never to decide WHETHER they get in — authorization is role-based via
// lib/access.ts (hasAnyRole / INTERNAL_ROLES) over the users.roles column.
const STUDENT_RE = /^[1-6][A-D]\d{2}/; // 1A01 … 6D40 (prefix match: a trailing suffix like 4D11_sakuten still counts — keep unanchored)

/**
 * The class code a username belongs to (e.g. "1A01" -> "1A"), or null for a
 * non-student account (teachers, committee, admin). The STUDENT_RE match
 * guarantees the two-char prefix is a valid class (1A..6D).
 */
export function classOf(username: string): string | null {
  return STUDENT_RE.test(username) ? username.slice(0, 2) : null;
}
