import "@/db/schema";

export type category = ["school", "external"];

export function isInternal(username: string): boolean {
  const STUDENT_RE = /^[1-6][A-D]\d{2}$/;
  const TEACHER_RE = /^k/;
  return STUDENT_RE.test(username) || TEACHER_RE.test(username);
}
