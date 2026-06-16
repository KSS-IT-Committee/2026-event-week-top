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

export type LogoutFormState = {
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

// A satellite app (equipment.2026.kss-it.com, …) sends the user here to log
// in and wants them back afterwards, so we accept absolute https URLs whose
// host is in the SESSION_COOKIE_DOMAIN family — and nothing else. The whole
// `*.2026.kss-it.com` namespace is committee-controlled, so this isn't an
// open redirect; an unrelated host still falls back to "/".
function isAllowedReturnHost(host: string): boolean {
  const domain = process.env.SESSION_COOKIE_DOMAIN;
  if (!domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

function safeNextPath(value: FormDataEntryValue | null): string {
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

  // Absolute URL back to a sibling app under the 2026 namespace.
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

// Driven by useActionState (like loginAction) so logout runs through the same
// client-side action transport that actually performs the post-action
// navigation — a plain server-component <form action> here did not navigate to
// `next` on submit.
export async function logoutAction(
  _prevState: LogoutFormState,
  formData: FormData,
): Promise<LogoutFormState> {
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

  redirect(safeNextPath(formData.get("next")));
}
