import { describe, expect, it } from "vitest";

import { hasAnyRole, INTERNAL_ROLES } from "@/lib/access";
import type { SessionUser } from "@/lib/session";

function makeUser(username: string, roles: string[] = []): SessionUser {
  return { username, roles } as SessionUser;
}

describe("hasAnyRole", () => {
  describe("single role", () => {
    it("returns true when the user has the role", () => {
      expect(hasAnyRole(makeUser("k0959176", ["IT"]), "IT")).toBe(true);
    });

    it("returns false when the user lacks the role", () => {
      expect(hasAnyRole(makeUser("k0959176", ["Sousakuten"]), "IT")).toBe(
        false,
      );
    });

    it("returns false when the user has no roles at all", () => {
      expect(hasAnyRole(makeUser("3B12", []), "IT")).toBe(false);
    });

    it("works for the population roles added for guard checks", () => {
      expect(hasAnyRole(makeUser("3B12", ["G3", "ClassB"]), "G3")).toBe(true);
      expect(hasAnyRole(makeUser("3B12", ["G3", "ClassB"]), "ClassC")).toBe(
        false,
      );
    });
  });

  describe("role lists (ANY-of semantics)", () => {
    it("returns true when the user holds one of several roles", () => {
      expect(
        hasAnyRole(makeUser("k0959176", ["Taiikusai"]), ["IT", "Taiikusai"]),
      ).toBe(true);
    });

    it("returns false when the user holds none of the roles", () => {
      expect(
        hasAnyRole(makeUser("3B12", ["Students"]), ["IT", "Taiikusai"]),
      ).toBe(false);
    });

    it("returns false for an empty role list (deny-by-default)", () => {
      expect(hasAnyRole(makeUser("3B12", ["Students"]), [])).toBe(false);
    });

    it("accepts the readonly INTERNAL_ROLES constant", () => {
      expect(hasAnyRole(makeUser("3B12", ["Students"]), INTERNAL_ROLES)).toBe(
        true,
      );
      expect(
        hasAnyRole(makeUser("k0959176", ["Teachers"]), INTERNAL_ROLES),
      ).toBe(true);
    });
  });

  describe("username independence (no regex)", () => {
    it("denies a student-shaped username that carries no roles", () => {
      expect(hasAnyRole(makeUser("3B12"), INTERNAL_ROLES)).toBe(false);
    });

    it("denies a staff-shaped username that carries no roles", () => {
      expect(hasAnyRole(makeUser("k0959176"), INTERNAL_ROLES)).toBe(false);
    });

    it("admits any username shape that holds a matching role", () => {
      expect(hasAnyRole(makeUser("admin", ["Teachers"]), INTERNAL_ROLES)).toBe(
        true,
      );
    });
  });
});

describe("INTERNAL_ROLES", () => {
  it("is exactly Students + Teachers", () => {
    expect([...INTERNAL_ROLES].sort()).toEqual(["Students", "Teachers"]);
  });
});
