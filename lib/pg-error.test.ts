import { describe, expect, it } from "vitest";

import { isForeignKeyViolation, isUniqueViolation } from "@/lib/pg-error";

function pgError(code: string, constraintName?: string) {
  return Object.assign(new Error("db rejected the query"), {
    code,
    ...(constraintName === undefined
      ? {}
      : { constraint_name: constraintName }),
  });
}

describe("isUniqueViolation", () => {
  it("matches SQLSTATE 23505 when no constraint is named", () => {
    expect(isUniqueViolation(pgError("23505"))).toBe(true);
  });

  it("matches only the named constraint when one is given", () => {
    const error = pgError("23505", "seats_performance_seat_unique");

    expect(isUniqueViolation(error, "seats_performance_seat_unique")).toBe(
      true,
    );
    expect(isUniqueViolation(error, "seats_username_performance_unique")).toBe(
      false,
    );
  });

  it("does not match a named constraint when the error carries none", () => {
    expect(
      isUniqueViolation(pgError("23505"), "seats_performance_seat_unique"),
    ).toBe(false);
  });

  it("rejects other SQLSTATEs", () => {
    expect(isUniqueViolation(pgError("23503"))).toBe(false);
  });

  it("rejects values that are not error-shaped", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation({ code: 23505 })).toBe(false);
  });
});

describe("isForeignKeyViolation", () => {
  it("matches SQLSTATE 23503", () => {
    expect(isForeignKeyViolation(pgError("23503"))).toBe(true);
  });

  it("rejects other SQLSTATEs and non-errors", () => {
    expect(isForeignKeyViolation(pgError("23505"))).toBe(false);
    expect(isForeignKeyViolation(null)).toBe(false);
    expect(isForeignKeyViolation({})).toBe(false);
  });
});
