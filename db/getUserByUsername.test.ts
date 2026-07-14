import { connection } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getUserByUsername } from "@/db/getUserByUsername";
import { db } from "@/lib/db";

const { rowsHolder, callsHolder } = vi.hoisted(() => ({
  rowsHolder: { rows: [] as unknown[] },
  callsHolder: { calls: [] as string[] },
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {
    callsHolder.calls.push("connection");
  }),
}));

vi.mock("@/lib/db", () => {
  function chain() {
    const p = Promise.resolve(rowsHolder.rows);
    const proxy: unknown = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return p.then.bind(p);
        if (prop === "catch") return p.catch.bind(p);
        if (prop === "finally") return p.finally.bind(p);
        if (typeof prop === "string") callsHolder.calls.push(prop);
        return () => proxy;
      },
      apply: () => proxy,
    });
    return proxy;
  }
  return {
    db: {
      select: vi.fn(() => {
        callsHolder.calls.push("select");
        return chain();
      }),
    },
  };
});

describe("getUserByUsername", () => {
  beforeEach(() => {
    rowsHolder.rows = [];
    callsHolder.calls = [];
  });

  it("awaits connection() before querying", async () => {
    rowsHolder.rows = [];
    await getUserByUsername("alice");
    expect(vi.mocked(connection)).toHaveBeenCalledTimes(1);
    // connection() must run and resolve before the SELECT chain starts.
    const connectionIndex = callsHolder.calls.indexOf("connection");
    const selectIndex = callsHolder.calls.indexOf("select");
    expect(connectionIndex).toBeGreaterThanOrEqual(0);
    expect(selectIndex).toBeGreaterThanOrEqual(0);
    expect(connectionIndex).toBeLessThan(selectIndex);
  });

  it("returns the first row when the query yields rows", async () => {
    const user = { id: 1, username: "alice", role: "IT" };
    rowsHolder.rows = [user];
    const result = await getUserByUsername("alice");
    expect(result).toBe(user);
  });

  it("returns only the first row when multiple rows are yielded", async () => {
    const first = { id: 1, username: "alice" };
    const second = { id: 2, username: "alice" };
    rowsHolder.rows = [first, second];
    const result = await getUserByUsername("alice");
    expect(result).toBe(first);
  });

  it("returns null when the query yields an empty array", async () => {
    rowsHolder.rows = [];
    const result = await getUserByUsername("nobody");
    expect(result).toBeNull();
  });

  it("selects from the users table filtered by username (select->from->where)", async () => {
    rowsHolder.rows = [{ id: 1, username: "alice" }];
    await getUserByUsername("alice");
    expect(callsHolder.calls).toContain("select");
    expect(callsHolder.calls).toContain("from");
    expect(callsHolder.calls).toContain("where");
    const selectIndex = callsHolder.calls.indexOf("select");
    const fromIndex = callsHolder.calls.indexOf("from");
    const whereIndex = callsHolder.calls.indexOf("where");
    expect(selectIndex).toBeLessThan(fromIndex);
    expect(fromIndex).toBeLessThan(whereIndex);
  });

  it("invokes db.select() exactly once with no arguments", async () => {
    rowsHolder.rows = [{ id: 1, username: "alice" }];
    await getUserByUsername("alice");
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.select)).toHaveBeenCalledWith();
  });

  it("coalesces a nullish first row to null (?? null)", async () => {
    // Destructured `const [user]` is undefined for a sparse/empty slot,
    // so the `?? null` branch must normalize it to null, never undefined.
    rowsHolder.rows = [];
    const result = await getUserByUsername("ghost");
    expect(result).toBeNull();
    expect(result).not.toBeUndefined();
  });
});
