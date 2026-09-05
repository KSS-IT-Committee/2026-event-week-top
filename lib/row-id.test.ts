import { describe, expect, it } from "vitest";

import { MAX_ROW_ID, parseRowId } from "@/lib/row-id";

describe("parseRowId", () => {
  it("accepts a plain decimal id", () => {
    expect(parseRowId("1")).toBe(1);
    expect(parseRowId("42")).toBe(42);
  });

  it("accepts the largest id a serial column can hold", () => {
    expect(MAX_ROW_ID).toBe(2147483647);
    expect(parseRowId(String(MAX_ROW_ID))).toBe(MAX_ROW_ID);
  });

  it("rejects anything past that, which Postgres would reject as out of range", () => {
    // Left through, these reach the driver as an int4 parameter and turn a
    // 404 into a 500.
    expect(parseRowId(String(MAX_ROW_ID + 1))).toBeNull();
    expect(parseRowId("4294967296")).toBeNull();
    expect(parseRowId("99999999999999999999")).toBeNull();
  });

  it("rejects 0, which no serial ever issues", () => {
    expect(parseRowId("0")).toBeNull();
  });

  it("rejects the spellings Number() would otherwise accept", () => {
    // Each of these would name the same row under a different URL.
    for (const value of ["1e3", " 12 ", "0x10", "+7", "12.0", "12.5", ""]) {
      expect(parseRowId(value)).toBeNull();
    }
  });

  it("rejects negatives, which the digit-only rule already excludes", () => {
    expect(parseRowId("-1")).toBeNull();
    expect(parseRowId("-2147483649")).toBeNull();
  });

  it("rejects values that are not strings at all", () => {
    // FormData.get() returns File | string | null.
    for (const value of [null, undefined, 12, {}, []]) {
      expect(parseRowId(value)).toBeNull();
    }
  });
});
