import { describe, expect, it, vi } from "vitest";

import { AuthGuard } from "@/app/components/AuthGuard";
import { Internal } from "@/app/components/Internal";
import { INTERNAL_ROLES } from "@/lib/access";
import { getCurrentUser } from "@/lib/session";

// ── Module mocks ──────────────────────────────────────────────────────────
// The guards interrupt rendering via next/navigation; the real
// unauthorized()/forbidden() also throw (they render Next's 401/403 pages),
// so throwing sentinels here keeps the control flow faithful and lets each
// test assert exactly which interrupt fired.
vi.mock("next/navigation", () => ({
  unauthorized: vi.fn(() => {
    throw new Error("UNAUTHORIZED_401");
  }),
  forbidden: vi.fn(() => {
    throw new Error("FORBIDDEN_403");
  }),
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

const getCurrentUserMock = vi.mocked(getCurrentUser);

// A user holding every role that exists — if even this user is denied, the
// guard denies everyone (the deny-by-default contract).
const EVERY_ROLE = [
  "IT",
  "Sousakuten",
  "Taiikusai",
  "G3",
  "ClassB",
  "Students",
  "Teachers",
];

function loggedInAs(roles: string[]) {
  getCurrentUserMock.mockResolvedValue({ username: "3B12", roles });
}

describe("AuthGuard", () => {
  it("401s when not logged in, before any role logic", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(
      AuthGuard({ children: null, role: INTERNAL_ROLES }),
    ).rejects.toThrow("UNAUTHORIZED_401");
  });

  it("blocks EVERY user when no role prop is given (deny-by-default)", async () => {
    loggedInAs(EVERY_ROLE);
    await expect(AuthGuard({ children: null })).rejects.toThrow(
      "FORBIDDEN_403",
    );
  });

  it("blocks every user for an explicitly empty role list", async () => {
    loggedInAs(EVERY_ROLE);
    await expect(AuthGuard({ children: null, role: [] })).rejects.toThrow(
      "FORBIDDEN_403",
    );
  });

  it("403s a logged-in user missing the required role", async () => {
    loggedInAs(["Students"]);
    await expect(
      AuthGuard({ children: null, role: "Sousakuten" }),
    ).rejects.toThrow("FORBIDDEN_403");
  });

  it("admits a user holding one of the requested roles", async () => {
    loggedInAs(["Students"]);
    await expect(
      AuthGuard({ children: null, role: INTERNAL_ROLES }),
    ).resolves.toBeTruthy();
  });
});

describe("Internal", () => {
  it("renders nothing when not logged in, even with a role prop", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(
      Internal({ children: null, role: INTERNAL_ROLES }),
    ).resolves.toBeNull();
  });

  it("renders nothing for EVERY user when no role prop is given (deny-by-default)", async () => {
    loggedInAs(EVERY_ROLE);
    await expect(Internal({ children: null })).resolves.toBeNull();
  });

  it("renders nothing for an explicitly empty role list", async () => {
    loggedInAs(EVERY_ROLE);
    await expect(Internal({ children: null, role: [] })).resolves.toBeNull();
  });

  it("renders nothing for a user missing the required role", async () => {
    loggedInAs(["Teachers"]);
    await expect(
      Internal({ children: null, role: "Sousakuten" }),
    ).resolves.toBeNull();
  });

  it("renders the fragment for a user holding a requested role", async () => {
    loggedInAs(["Teachers"]);
    await expect(
      Internal({ children: null, role: INTERNAL_ROLES }),
    ).resolves.not.toBeNull();
  });
});
