import { describe, expect, it } from "vitest";

import { hasAccess } from "@/lib/access";
import type { SessionUser } from "@/lib/session";

function makeUser(username: string, roles: string[] = []): SessionUser {
  return { username, roles } as SessionUser;
}

describe("hasAccess", () => {
  describe("class constraint", () => {
    it("returns true when the user's class matches a single classCode", () => {
      expect(hasAccess(makeUser("3B12"), undefined, "3B")).toBe(true);
    });

    it("returns false when the user's class does not match the classCode", () => {
      expect(hasAccess(makeUser("3C12"), undefined, "3B")).toBe(false);
    });

    it("returns true when the user's class is in a classCode array", () => {
      expect(hasAccess(makeUser("4A05"), undefined, ["3B", "4A"])).toBe(true);
    });

    it("returns false when a teacher (null class) is given a classCode and no role", () => {
      expect(hasAccess(makeUser("k0959176"), undefined, "3B")).toBe(false);
    });
  });

  describe("role constraint", () => {
    it("returns true when the user has the single required role", () => {
      expect(hasAccess(makeUser("k0959176", ["IT"]), "IT", undefined)).toBe(
        true,
      );
    });

    it("returns false when the user lacks the single required role", () => {
      expect(
        hasAccess(makeUser("k0959176", ["Sousakuten"]), "IT", undefined),
      ).toBe(false);
    });

    it("returns true when the user has one of several required roles", () => {
      expect(
        hasAccess(
          makeUser("k0959176", ["Taiikusai"]),
          ["IT", "Taiikusai"],
          undefined,
        ),
      ).toBe(true);
    });

    it("returns false when the role is given but the user has no roles", () => {
      expect(hasAccess(makeUser("3B12", []), "IT", undefined)).toBe(false);
    });
  });

  describe("OR semantics between role and class", () => {
    it("returns true when the role does not match but the class does", () => {
      expect(hasAccess(makeUser("3B12", []), "IT", "3B")).toBe(true);
    });
  });

  describe("no constraints", () => {
    it("returns false when both role and classCode are undefined", () => {
      expect(hasAccess(makeUser("3B12"), undefined, undefined)).toBe(false);
    });
  });
});
