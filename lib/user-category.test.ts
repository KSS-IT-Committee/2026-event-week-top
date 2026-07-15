import { describe, expect, it } from "vitest";

import { classOf } from "@/lib/user-category";

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

    it("returns null for grade 7", () => {
      expect(classOf("7A01")).toBeNull();
    });

    it("returns null for class letter E (only A-D allowed)", () => {
      expect(classOf("1E01")).toBeNull();
    });

    it("returns null when fewer than two digits follow the class", () => {
      expect(classOf("1A1")).toBeNull();
    });

    it("returns null for a lowercase class letter", () => {
      expect(classOf("1a01")).toBeNull();
    });

    it("returns null when the pattern does not start at index 0", () => {
      expect(classOf("x1A01")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(classOf("")).toBeNull();
    });
  });
});
