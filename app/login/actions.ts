"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { deleteUserSessions } from "@/db/deleteUserSessions";
import { getUserByUsername } from "@/db/getUserByUsername";
import { setUserLoggedIn } from "@/db/setUserLoggedIn";
import { updateUserPassword } from "@/db/updateUserPassword";
import { checkRateLimit } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/safe-next";
import {
  createSession,
  getCurrentUser,
  invalidateSession,
} from "@/lib/session";
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

export type ChangePasswordFormState = {
  error: string | null;
  success: boolean;
};

// Compared against when the username doesn't exist, so a login attempt
// costs the same bcrypt time either way (no username probing via response
// timing). Hash of a random throwaway string, cost 12 like the real ones.
const DUMMY_PASSWORD_HASH =
  "$2b$12$b9knPwSWvdYaEpu/5ogc1esBjm6AIkZxstMde5jGCUCTMizZEUogO";

// Per-account login throttle, checked before the cost-12 bcrypt.compare.
// Keyed by username, NOT IP: the school logs in en masse from a shared NAT,
// so a per-IP cap would lock out legitimate students. This slows targeted
// guessing of a single account; the unauthenticated CPU-exhaustion vector is
// for nginx limit_req at the edge. Per-process only (see lib/rate-limit.ts).
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_RATE_WINDOW_MS = 60_000;

// Students type credentials from printed cards, often through a Japanese
// IME — fold full-width characters back to ASCII and trim stray whitespace.
function normalizeInput(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim();
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  // Usernames are matched case-sensitively as printed: students are upper-case
  // (e.g. 1A01), staff are lower-case (e.g. k0959176). Keep the raw case — only
  // NFKC + trim. Passwords are case-sensitive too.
  const username = normalizeInput(formData.get("username"));
  const password = normalizeInput(formData.get("password"));
  if (username === "" || password === "") {
    return { error: "ユーザー名とパスワードを入力してください。" };
  }

  const attempt = checkRateLimit(
    `login:${username}`,
    LOGIN_MAX_ATTEMPTS,
    LOGIN_RATE_WINDOW_MS,
  );
  if (!attempt.ok) {
    return {
      error: "試行回数が多すぎます。しばらくしてからもう一度お試しください。",
    };
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

// Minimum length of a self-chosen password. A floor, not a strength policy —
// the seeded card passwords are stronger than this; we only stop someone
// replacing one with something trivially short.
const PASSWORD_MIN_LENGTH = 8;
// bcrypt (and bcryptjs) silently truncates its input at 72 *bytes*, so anything
// past that wouldn't really be part of the password. NFKC-folded Japanese input
// is multi-byte, so this is a byte cap, not a character cap. Reject rather than
// store a password whose tail is ignored.
const PASSWORD_MAX_BYTES = 72;

// Per-account throttle on the cost-12 bcrypt verify, mirroring loginAction.
const PWCHANGE_MAX_ATTEMPTS = 10;
const PWCHANGE_RATE_WINDOW_MS = 60_000;

// Change the logged-in user's password. This lives on the shared /login page,
// so — like the session itself — it works from every app under the namespace:
// each app's AccountNav links here, the cookie is read with getCurrentUser, and
// the write lands in the shared `appdata`. A successful change invalidates the
// user's sessions on *all* apps and re-issues one for this device.
export async function changePasswordAction(
  _prevState: ChangePasswordFormState,
  formData: FormData,
): Promise<ChangePasswordFormState> {
  // Self-authorize from the session, NOT from form input: a Server Action is
  // independently invocable, and the new password must always apply to the
  // caller's own account. Never read a username from formData here — that would
  // be a "change anyone's password" hole.
  const sessionUser = await getCurrentUser();
  if (sessionUser === null) {
    return {
      error: "セッションが無効です。再度ログインしてください。",
      success: false,
    };
  }
  const { username } = sessionUser;

  // Normalize exactly like loginAction so a password set here is byte-for-byte
  // what the login form will later submit (NFKC-fold full-width IME input, trim
  // surrounding whitespace).
  const currentPassword = normalizeInput(formData.get("currentPassword"));
  const newPassword = normalizeInput(formData.get("newPassword"));
  const confirmPassword = normalizeInput(formData.get("confirmPassword"));

  if (currentPassword === "" || newPassword === "" || confirmPassword === "") {
    return { error: "すべての項目を入力してください。", success: false };
  }
  if (newPassword !== confirmPassword) {
    return { error: "新しいパスワードが一致しません。", success: false };
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      error: `新しいパスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください。`,
      success: false,
    };
  }
  if (Buffer.byteLength(newPassword, "utf8") > PASSWORD_MAX_BYTES) {
    return { error: "新しいパスワードが長すぎます。", success: false };
  }
  if (newPassword === currentPassword) {
    return {
      error: "新しいパスワードが現在のパスワードと異なるものにしてください。",
      success: false,
    };
  }

  const attempt = checkRateLimit(
    `pwchange:${username}`,
    PWCHANGE_MAX_ATTEMPTS,
    PWCHANGE_RATE_WINDOW_MS,
  );
  if (!attempt.ok) {
    return {
      error: "試行回数が多すぎます。しばらくしてからもう一度お試しください。",
      success: false,
    };
  }

  // Re-verify the current password against the stored hash. SessionUser carries
  // only { username, roles }, so re-fetch the row for its hash. This stops a
  // shoulder-surfed or hijacked session from silently resetting the password.
  const account = await getUserByUsername(username);
  if (account === null) {
    return {
      error: "セッションが無効です。再度ログインしてください。",
      success: false,
    };
  }
  const isCurrentValid = await bcrypt.compare(
    currentPassword,
    account.passwordHash,
  );
  if (!isCurrentValid) {
    return { error: "現在のパスワードが正しくありません。", success: false };
  }

  // Cost 12 to match the existing seeded hashes (and the login dummy hash).
  const newHash = await bcrypt.hash(newPassword, 12);
  await updateUserPassword(username, newHash);

  // A password change logs the user out everywhere: drop every session for the
  // account (shared `sessions` table → all apps), then re-issue one for this
  // device so the person who just changed it stays logged in here. On a PR
  // preview the schema-only clone has no rows, so both calls are harmless
  // no-ops (the verify above already fails closed there).
  await deleteUserSessions(username);
  const token = await createSession(username);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());

  return { error: null, success: true };
}
