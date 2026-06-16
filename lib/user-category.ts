import { type ClassName, isClassName } from "@/db/schema";

export type category = ["school", "external"];

// Student logins are `<class><seat>` e.g. 1A01 .. 6D40; staff are k-prefixed.
const STUDENT_RE = /^[1-6][A-D]\d{2}$/;
const TEACHER_RE = /^k/;

export function isInternal(username: string): boolean {
  return STUDENT_RE.test(username) || TEACHER_RE.test(username);
}

/**
 * The class a username belongs to (e.g. "1A01" -> "1A"), or null for any
 * non-student account (teachers, committee, admin). Used to scope class-private
 * data — deductions and announcements — to the logged-in student's own class.
 */
export function classOf(username: string): ClassName | null {
  if (!STUDENT_RE.test(username)) return null;
  const className = username.slice(0, 2);
  return isClassName(className) ? className : null;
}
