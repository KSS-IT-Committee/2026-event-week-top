const STUDENT_RE = /^[1-6][A-D]\d{2}$/; // 1A01 … 6D40
const TEACHER_RE = /^k\d{7}$/; // staff accounts: k + 7 digits, e.g. k0959176

export function isInternal(username: string): boolean {
  return STUDENT_RE.test(username) || TEACHER_RE.test(username);
}

/**
 * The class code a username belongs to (e.g. "1A01" -> "1A"), or null for a
 * non-student account (teachers, committee, admin). The STUDENT_RE match
 * guarantees the two-char prefix is a valid class (1A..6D).
 */
export function classOf(username: string): string | null {
  return STUDENT_RE.test(username) ? username.slice(0, 2) : null;
}
