import { describe, expect, it } from "vitest";

import { classOf, isInternal } from "@/lib/user-category";

describe("isInternal", () => {
  describe("student accounts (true)", () => {
    it.each(["1A01", "6D40", "3B12"])(
      "returns true for a plain student username %s",
      (username) => {
        expect(isInternal(username)).toBe(true);
      },
    );

    it("returns true for a student prefix with a trailing suffix (prefix match)", () => {
      expect(isInternal("4D11_sakuten")).toBe(true);
    });

    it("returns true for a student prefix with extra trailing characters", () => {
      expect(isInternal("1A99extra")).toBe(true);
    });

    it("returns true across the full grade and class boundaries", () => {
      const grades = ["1", "2", "3", "4", "5", "6"];
      const classes = ["A", "B", "C", "D"];
      for (const g of grades) {
        for (const c of classes) {
          expect(isInternal(`${g}${c}01`)).toBe(true);
        }
      }
    });
  });

  describe("teacher accounts (true)", () => {
    it("returns true for k + exactly 7 digits", () => {
      expect(isInternal("k0959176")).toBe(true);
    });
  });

  describe("invalid usernames (false)", () => {
    it("returns false for grade 0", () => {
      expect(isInternal("0A01")).toBe(false);
    });

    it("returns false for grade 7", () => {
      expect(isInternal("7A01")).toBe(false);
    });

    it("returns false for class letter E (only A-D allowed)", () => {
      expect(isInternal("1E01")).toBe(false);
    });

    it("returns false when fewer than two digits follow the class", () => {
      expect(isInternal("1A1")).toBe(false);
    });

    it("returns false for a lowercase class letter", () => {
      expect(isInternal("1a01")).toBe(false);
    });

    it("returns false when the student pattern does not start at index 0", () => {
      expect(isInternal("x1A01")).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(isInternal("")).toBe(false);
    });

    it("returns false for an arbitrary admin-style name", () => {
      expect(isInternal("admin")).toBe(false);
    });

    it("returns false for uppercase K teacher prefix", () => {
      expect(isInternal("K0959176")).toBe(false);
    });

    it("returns false for a teacher account with only 6 digits", () => {
      expect(isInternal("k095917")).toBe(false);
    });

    it("returns false for a teacher account with 8 digits (anchored end fails)", () => {
      expect(isInternal("k09591766")).toBe(false);
    });

    it("returns false for a teacher account with a trailing non-digit", () => {
      expect(isInternal("k0959176a")).toBe(false);
    });
  });
});

describe("classOf", () => {
  describe("students return the two-char class prefix", () => {
    it("returns 1A for 1A01", () => {
      expect(classOf("1A01")).toBe("1A");
    });

    it("returns 6D for 6D40", () => {
      expect(classOf("6D40")).toBe("6D");
    });

    it("returns 4D for a prefixed-with-suffix student username", () => {
      expect(classOf("4D11_sakuten")).toBe("4D");
    });

    it("returns 3B for a student username with trailing characters", () => {
      expect(classOf("3B12xyz")).toBe("3B");
    });

    it("returns the prefix across grade and class boundaries", () => {
      const grades = ["1", "2", "3", "4", "5", "6"];
      const classes = ["A", "B", "C", "D"];
      for (const g of grades) {
        for (const c of classes) {
          expect(classOf(`${g}${c}07`)).toBe(`${g}${c}`);
        }
      }
    });
  });

  describe("non-student accounts return null", () => {
    it("returns null for a teacher account", () => {
      expect(classOf("k0959176")).toBeNull();
    });

    it("returns null for an admin-style name", () => {
      expect(classOf("admin")).toBeNull();
    });

    it("returns null for grade 0", () => {
      expect(classOf("0A01")).toBeNull();
    });

    it("returns null for a lowercase class letter", () => {
      expect(classOf("1a01")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(classOf("")).toBeNull();
    });
  });
});
