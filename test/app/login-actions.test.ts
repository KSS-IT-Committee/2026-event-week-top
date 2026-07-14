import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  changePasswordAction,
  loginAction,
  logoutAction,
} from "@/app/login/actions";
import { deleteUserSessions } from "@/db/deleteUserSessions";
import { getUserByUsername } from "@/db/getUserByUsername";
import { setUserLoggedIn } from "@/db/setUserLoggedIn";
import { updateUserPassword } from "@/db/updateUserPassword";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/safe-next";
import {
  createSession,
  getCurrentUser,
  invalidateSession,
} from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

// ── Module mocks ──────────────────────────────────────────────────────────
// actions.ts does `import bcrypt from "bcryptjs"` (default import), so the mock
// must expose a `default` object holding the functions it uses.
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
// redirect throws so the success/redirect paths never fall through — we assert
// the thrown "REDIRECT:<path>" and that side effects ran before it.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error("REDIRECT:" + url);
  }),
}));
vi.mock("@/db/getUserByUsername", () => ({ getUserByUsername: vi.fn() }));
vi.mock("@/db/setUserLoggedIn", () => ({
  setUserLoggedIn: vi.fn(async () => {}),
}));
vi.mock("@/db/updateUserPassword", () => ({
  updateUserPassword: vi.fn(async () => {}),
}));
vi.mock("@/db/deleteUserSessions", () => ({
  deleteUserSessions: vi.fn(async () => {}),
}));
vi.mock("@/lib/db", () => ({
  db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true, retryAfterSeconds: 0 })),
}));
vi.mock("@/lib/session", () => ({
  createSession: vi.fn(async () => "tok"),
  getCurrentUser: vi.fn(),
  invalidateSession: vi.fn(async () => {}),
}));
vi.mock("@/lib/safe-next", () => ({
  safeNextPath: vi.fn((v: unknown) =>
    typeof v === "string" && v.startsWith("/") ? v : "/",
  ),
}));
// @/lib/session-cookie is left real (it is pure). SESSION_COOKIE_NAME is the
// literal "kss_session".

type CookieStore = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

let cookieStore: CookieStore;

// Build a FormData from a plain object.
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  // clearMocks wipes call history AND implementations, so re-create the store
  // and re-apply the default mock implementations every test.
  cookieStore = { get: vi.fn(), set: vi.fn() };
  vi.mocked(cookies).mockResolvedValue(cookieStore as never);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error("REDIRECT:" + url);
  });
  vi.mocked(checkRateLimit).mockReturnValue({ ok: true, retryAfterSeconds: 0 });
  vi.mocked(setUserLoggedIn).mockResolvedValue(undefined);
  vi.mocked(updateUserPassword).mockResolvedValue(undefined);
  vi.mocked(deleteUserSessions).mockResolvedValue(undefined);
  vi.mocked(createSession).mockResolvedValue("tok");
  vi.mocked(invalidateSession).mockResolvedValue(undefined);
  vi.mocked(db.transaction).mockImplementation(((
    cb: (tx: unknown) => unknown,
  ) => Promise.resolve(cb({}))) as never);
  vi.mocked(safeNextPath).mockImplementation((v) =>
    typeof v === "string" && v.startsWith("/") ? v : "/",
  );
});

afterEach(() => {
  vi.useRealTimers();
});

// ── loginAction ─────────────────────────────────────────────────────────────
describe("loginAction", () => {
  const EMPTY_FIELDS_ERROR = "ユーザー名とパスワードを入力してください。";
  const RATE_LIMIT_ERROR =
    "試行回数が多すぎます。しばらくしてからもう一度お試しください。";
  const BAD_CREDENTIALS_ERROR =
    "ユーザー名またはパスワードが正しくありません。";
  const prev = { error: null };

  it("returns the field error when username is empty (no DB, no redirect)", async () => {
    const result = await loginAction(prev, fd({ username: "", password: "p" }));

    expect(result).toEqual({ error: EMPTY_FIELDS_ERROR });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(getUserByUsername).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("returns the field error when password is empty (no DB, no redirect)", async () => {
    const result = await loginAction(
      prev,
      fd({ username: "1A01", password: "" }),
    );

    expect(result).toEqual({ error: EMPTY_FIELDS_ERROR });
    expect(getUserByUsername).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("treats whitespace-only fields as empty after normalization", async () => {
    const result = await loginAction(
      prev,
      fd({ username: "   ", password: "p" }),
    );

    expect(result).toEqual({ error: EMPTY_FIELDS_ERROR });
    expect(getUserByUsername).not.toHaveBeenCalled();
  });

  it("returns the rate-limit error when checkRateLimit denies (no DB, no compare)", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      ok: false,
      retryAfterSeconds: 30,
    });

    const result = await loginAction(
      prev,
      fd({ username: "1A01", password: "secret" }),
    );

    expect(result).toEqual({ error: RATE_LIMIT_ERROR });
    expect(checkRateLimit).toHaveBeenCalledWith("login:1A01", 10, 60_000);
    expect(getUserByUsername).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns the bad-credentials error and still runs bcrypt.compare when user is null", async () => {
    vi.mocked(getUserByUsername).mockResolvedValue(null as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const result = await loginAction(
      prev,
      fd({ username: "ghost", password: "secret" }),
    );

    expect(result).toEqual({ error: BAD_CREDENTIALS_ERROR });
    // The dummy-hash path keeps timing constant: compare must run even when the
    // user does not exist (so response time can't probe usernames).
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    expect(createSession).not.toHaveBeenCalled();
    expect(setUserLoggedIn).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns the bad-credentials error when the user exists but the password is wrong", async () => {
    vi.mocked(getUserByUsername).mockResolvedValue({
      username: "1A01",
      passwordHash: "h",
      hasLoggedIn: true,
      roles: [],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const result = await loginAction(
      prev,
      fd({ username: "1A01", password: "wrong" }),
    );

    expect(result).toEqual({ error: BAD_CREDENTIALS_ERROR });
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    expect(createSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("on valid login: creates session, latches logged-in, sets cookie, and redirects to the safe next", async () => {
    vi.mocked(getUserByUsername).mockResolvedValue({
      username: "1A01",
      passwordHash: "h",
      hasLoggedIn: false,
      roles: [],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(safeNextPath).mockReturnValue("/dest");

    await expect(
      loginAction(
        prev,
        fd({ username: "1A01", password: "secret", next: "/dest" }),
      ),
    ).rejects.toThrow("REDIRECT:/dest");

    expect(createSession).toHaveBeenCalledWith("1A01");
    expect(setUserLoggedIn).toHaveBeenCalledWith("1A01");
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
    expect(name).toBe("kss_session");
    expect(value).toBe("tok");
    // Real (pure) session-cookie options: httpOnly + lax + path "/".
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    expect(typeof options.maxAge).toBe("number");
    expect(redirect).toHaveBeenCalledWith("/dest");
  });

  it("passes the raw next value through safeNextPath on success", async () => {
    vi.mocked(getUserByUsername).mockResolvedValue({
      username: "1A01",
      passwordHash: "h",
      hasLoggedIn: false,
      roles: [],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    // safeNextPath default impl rewrites a non-"/"-prefixed value to "/".
    await expect(
      loginAction(
        prev,
        fd({ username: "1A01", password: "secret", next: "https://evil.test" }),
      ),
    ).rejects.toThrow("REDIRECT:/");

    expect(safeNextPath).toHaveBeenCalledWith("https://evil.test");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("compares against the stored hash when the user exists", async () => {
    vi.mocked(getUserByUsername).mockResolvedValue({
      username: "1A01",
      passwordHash: "stored-hash",
      hasLoggedIn: true,
      roles: [],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await loginAction(prev, fd({ username: "1A01", password: "pw" }));

    expect(bcrypt.compare).toHaveBeenCalledWith("pw", "stored-hash");
  });
});

// ── logoutAction ────────────────────────────────────────────────────────────
describe("logoutAction", () => {
  const prev = { error: null };

  it("invalidates the session, clears the cookie with maxAge 0, and redirects when a token is present", async () => {
    cookieStore.get.mockReturnValue({ value: "tok" });
    vi.mocked(safeNextPath).mockReturnValue("/after");

    await expect(logoutAction(prev, fd({ next: "/after" }))).rejects.toThrow(
      "REDIRECT:/after",
    );

    expect(cookieStore.get).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    expect(invalidateSession).toHaveBeenCalledWith("tok");
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("kss_session");
    expect(value).toBe("");
    expect(options.maxAge).toBe(0);
    expect(redirect).toHaveBeenCalledWith("/after");
  });

  it("does not call invalidateSession when there is no token, but still clears the cookie and redirects", async () => {
    cookieStore.get.mockReturnValue(undefined);

    // No `next` field → safeNextPath(null) → "/".
    await expect(logoutAction(prev, fd({}))).rejects.toThrow("REDIRECT:/");

    expect(invalidateSession).not.toHaveBeenCalled();
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("kss_session");
    expect(value).toBe("");
    expect(options.maxAge).toBe(0);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("treats an empty-string token as absent (skips invalidateSession)", async () => {
    cookieStore.get.mockReturnValue({ value: "" });

    await expect(logoutAction(prev, fd({}))).rejects.toThrow("REDIRECT:/");

    expect(invalidateSession).not.toHaveBeenCalled();
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
  });

  it("defaults the redirect target to safeNextPath(next)", async () => {
    cookieStore.get.mockReturnValue({ value: "tok" });

    await expect(logoutAction(prev, fd({ next: "/home" }))).rejects.toThrow(
      "REDIRECT:/home",
    );

    expect(safeNextPath).toHaveBeenCalledWith("/home");
  });
});

// ── changePasswordAction ──────────────────────────────────────────────────────
describe("changePasswordAction", () => {
  const prev = { error: null, success: false };

  // A valid, distinct, 8–72-byte new password used by several tests.
  const VALID_NEW = "newpass123";
  const VALID_CURRENT = "oldpass123";

  function validForm(
    overrides: Partial<Record<string, string>> = {},
  ): FormData {
    return fd({
      currentPassword: VALID_CURRENT,
      newPassword: VALID_NEW,
      confirmPassword: VALID_NEW,
      ...overrides,
    });
  }

  it("returns the no-session error when getCurrentUser is null", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const result = await changePasswordAction(prev, validForm());

    expect(result).toEqual({
      error: "セッションが無効です。再度ログインしてください。",
      success: false,
    });
    expect(getUserByUsername).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  describe("with a valid session", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        username: "1A01",
        roles: [],
      });
    });

    it("returns the all-fields-required error when currentPassword is empty", async () => {
      const result = await changePasswordAction(
        prev,
        validForm({ currentPassword: "" }),
      );

      expect(result).toEqual({
        error: "すべての項目を入力してください。",
        success: false,
      });
    });

    it("returns the all-fields-required error when newPassword is empty", async () => {
      const result = await changePasswordAction(
        prev,
        validForm({ newPassword: "" }),
      );

      expect(result).toEqual({
        error: "すべての項目を入力してください。",
        success: false,
      });
    });

    it("returns the all-fields-required error when confirmPassword is empty", async () => {
      const result = await changePasswordAction(
        prev,
        validForm({ confirmPassword: "" }),
      );

      expect(result).toEqual({
        error: "すべての項目を入力してください。",
        success: false,
      });
    });

    it("returns the mismatch error when newPassword !== confirmPassword", async () => {
      const result = await changePasswordAction(
        prev,
        validForm({ newPassword: "abcdefgh", confirmPassword: "abcdefgi" }),
      );

      expect(result).toEqual({
        error: "新しいパスワードが一致しません。",
        success: false,
      });
    });

    it("returns the too-short error when newPassword is under 8 chars", async () => {
      const result = await changePasswordAction(
        prev,
        validForm({ newPassword: "abc123", confirmPassword: "abc123" }),
      );

      expect(result).toEqual({
        error: "新しいパスワードは8文字以上にしてください。",
        success: false,
      });
    });

    it("accepts a new password of exactly 8 chars (does not hit the too-short branch)", async () => {
      vi.mocked(getUserByUsername).mockResolvedValue({
        username: "1A01",
        passwordHash: "old",
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue("newhash" as never);

      const result = await changePasswordAction(
        prev,
        validForm({ newPassword: "abcdefgh", confirmPassword: "abcdefgh" }),
      );

      expect(result).toEqual({ error: null, success: true });
    });

    it("returns the too-long error when newPassword exceeds 72 bytes (73 ASCII chars)", async () => {
      const long = "a".repeat(73);
      const result = await changePasswordAction(
        prev,
        validForm({ newPassword: long, confirmPassword: long }),
      );

      expect(result).toEqual({
        error: "新しいパスワードが長すぎます。",
        success: false,
      });
    });

    it("accepts a new password of exactly 72 bytes (does not hit the too-long branch)", async () => {
      const exact = "a".repeat(72);
      vi.mocked(getUserByUsername).mockResolvedValue({
        username: "1A01",
        passwordHash: "old",
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue("newhash" as never);

      const result = await changePasswordAction(
        prev,
        validForm({ newPassword: exact, confirmPassword: exact }),
      );

      expect(result).toEqual({ error: null, success: true });
    });

    it("returns the must-differ error when newPassword equals currentPassword", async () => {
      const result = await changePasswordAction(
        prev,
        validForm({
          currentPassword: VALID_NEW,
          newPassword: VALID_NEW,
          confirmPassword: VALID_NEW,
        }),
      );

      expect(result).toEqual({
        error: "新しいパスワードが現在のパスワードと異なるものにしてください。",
        success: false,
      });
      // The must-differ check runs before the rate-limit check.
      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it("returns the rate-limit error when checkRateLimit denies", async () => {
      vi.mocked(checkRateLimit).mockReturnValue({
        ok: false,
        retryAfterSeconds: 42,
      });

      const result = await changePasswordAction(prev, validForm());

      expect(result).toEqual({
        error: "試行回数が多すぎます。しばらくしてからもう一度お試しください。",
        success: false,
      });
      expect(checkRateLimit).toHaveBeenCalledWith("pwchange:1A01", 10, 60_000);
      expect(getUserByUsername).not.toHaveBeenCalled();
    });

    it("returns the no-session error when the user row is gone (getUserByUsername null)", async () => {
      vi.mocked(getUserByUsername).mockResolvedValue(null as never);

      const result = await changePasswordAction(prev, validForm());

      expect(result).toEqual({
        error: "セッションが無効です。再度ログインしてください。",
        success: false,
      });
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("returns the wrong-current-password error when bcrypt.compare is false", async () => {
      vi.mocked(getUserByUsername).mockResolvedValue({
        username: "1A01",
        passwordHash: "old",
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      const result = await changePasswordAction(prev, validForm());

      expect(result).toEqual({
        error: "現在のパスワードが正しくありません。",
        success: false,
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(VALID_CURRENT, "old");
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("on success: runs the transaction, updates password + purges sessions, re-issues a session, sets the cookie, and returns success", async () => {
      vi.mocked(getUserByUsername).mockResolvedValue({
        username: "1A01",
        passwordHash: "old",
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue("newhash" as never);

      const txArg = { tx: true };
      vi.mocked(db.transaction).mockImplementation(((
        cb: (tx: unknown) => unknown,
      ) => Promise.resolve(cb(txArg))) as never);

      const result = await changePasswordAction(prev, validForm());

      expect(result).toEqual({ error: null, success: true });
      expect(bcrypt.hash).toHaveBeenCalledWith(VALID_NEW, 12);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      // Both writes ran inside the transaction with the same tx executor.
      expect(updateUserPassword).toHaveBeenCalledWith("1A01", "newhash", txArg);
      expect(deleteUserSessions).toHaveBeenCalledWith("1A01", txArg);
      expect(createSession).toHaveBeenCalledWith("1A01");
      expect(cookieStore.set).toHaveBeenCalledTimes(1);
      const [name, value] = cookieStore.set.mock.calls[0];
      expect(name).toBe("kss_session");
      expect(value).toBe("tok");
    });

    it("re-issues the session only after the transaction (write order)", async () => {
      vi.mocked(getUserByUsername).mockResolvedValue({
        username: "1A01",
        passwordHash: "old",
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue("newhash" as never);

      const order: string[] = [];
      vi.mocked(db.transaction).mockImplementation(((
        cb: (tx: unknown) => unknown,
      ) => {
        order.push("transaction");
        return Promise.resolve(cb({}));
      }) as never);
      vi.mocked(createSession).mockImplementation(async () => {
        order.push("createSession");
        return "tok";
      });

      await changePasswordAction(prev, validForm());

      expect(order).toEqual(["transaction", "createSession"]);
    });

    it("does not read a username from the form (uses the session username)", async () => {
      vi.mocked(getUserByUsername).mockResolvedValue({
        username: "1A01",
        passwordHash: "old",
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue("newhash" as never);

      // Inject an attacker-controlled username; it must be ignored.
      await changePasswordAction(prev, validForm({ username: "victim" }));

      expect(getUserByUsername).toHaveBeenCalledWith("1A01");
      expect(updateUserPassword).toHaveBeenCalledWith(
        "1A01",
        "newhash",
        expect.anything(),
      );
    });
  });
});
