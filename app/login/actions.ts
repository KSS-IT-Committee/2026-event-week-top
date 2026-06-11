"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getUserByUsername } from "@/db/getUserByUsername";
import { setUserLoggedIn } from "@/db/setUserLoggedIn";
import { createSession, invalidateSession } from "@/lib/session";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/session-cookie";

export type LoginFormState = {
  error: string | null;
};

// Compared against when the username doesn't exist, so a login attempt
// costs the same bcrypt time either way (no username probing via response
// timing). Hash of a random throwaway string, cost 12 like the real ones.
const DUMMY_PASSWORD_HASH =
  "$2b$12$b9knPwSWvdYaEpu/5ogc1esBjm6AIkZxstMde5jGCUCTMizZEUogO";

// Students type credentials from printed cards, often through a Japanese
// IME — fold full-width characters back to ASCII and trim stray whitespace.
function normalizeInput(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim();
}

function safeNextPath(value: FormDataEntryValue | null): string {
  // Same-site relative paths only — anything else would be an open redirect.
  // Resolve against a sentinel origin and require it to survive unchanged: a
  // plain startsWith("/") check is not enough because browsers fold "\" to
  // "/", so "/\evil.com" (and control chars, and "//evil.com") resolve to a
  // foreign origin.
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  try {
    const url = new URL(value, "https://placeholder.invalid");
    if (url.origin !== "https://placeholder.invalid") return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  // Usernames are upper-case by construction (e.g. 1A01); accept lower-case
  // typing. Passwords are case-sensitive and only get NFKC + trim.
  const username = normalizeInput(formData.get("username")).toUpperCase();
  const password = normalizeInput(formData.get("password"));
  if (username === "" || password === "") {
    return { error: "ユーザー名とパスワードを入力してください。" };
  }

  const user = await getUserByUsername(username);
  const isValidPassword = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  if (user === null || !isValidPassword) {
    return { error: "ユーザー名またはパスワードが正しくありません。" };
  }

  // Create the session and latch `has_logged_in` in parallel — different
  // tables, and the flag is best-effort relative to the session.
  const [token] = await Promise.all([
    createSession(user.username),
    setUserLoggedIn(user.username),
  ]);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());

  redirect(safeNextPath(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await invalidateSession(token);
  }
  // Expire the cookie with the same attributes it was set with — a plain
  // delete() without the Domain attribute can't remove a Domain= cookie.
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
}
