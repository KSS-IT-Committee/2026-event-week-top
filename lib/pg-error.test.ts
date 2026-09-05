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

// What actually reaches a catch block: Drizzle wraps the driver error rather
// than rethrowing it, so the SQLSTATE fields sit on `cause`.
function drizzleWrapped(error: unknown) {
  return new Error("Failed query: insert into …", { cause: error });
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

describe("errors wrapped by Drizzle", () => {
  it("finds a unique violation on the cause chain", () => {
    const error = drizzleWrapped(
      pgError("23505", "seats_performance_seat_unique"),
    );

    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, "seats_performance_seat_unique")).toBe(
      true,
    );
    expect(isUniqueViolation(error, "some_other_unique")).toBe(false);
  });

  it("finds a foreign-key violation on the cause chain", () => {
    expect(isForeignKeyViolation(drizzleWrapped(pgError("23503")))).toBe(true);
  });

  it("looks through more than one link", () => {
    const error = drizzleWrapped(drizzleWrapped(pgError("23505")));
    expect(isUniqueViolation(error)).toBe(true);
  });

  it("stops rather than looping on a self-referential chain", () => {
    const looping: { cause?: unknown } = {};
    looping.cause = looping;
    expect(isUniqueViolation(looping)).toBe(false);
  });

  it("ignores a wrapper carrying no driver error at all", () => {
    expect(isUniqueViolation(drizzleWrapped(new Error("boom")))).toBe(false);
  });
});
