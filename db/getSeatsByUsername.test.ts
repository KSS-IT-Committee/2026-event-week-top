import { connection } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSeatsByUsername } from "@/db/getSeatsByUsername";
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
    const result = Promise.resolve(rowsHolder.rows);
    const proxy: unknown = new Proxy(function () {}, {
      get(_target, property) {
        if (property === "then") return result.then.bind(result);
        if (property === "catch") return result.catch.bind(result);
        if (property === "finally") return result.finally.bind(result);
        if (typeof property === "string") callsHolder.calls.push(property);
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

function makeSeat(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    username: "3A05",
    performance: "A",
    addedAt: new Date("2026-09-07T00:00:00Z"),
    seat: "A-12",
    ...overrides,
  };
}

describe("getSeatsByUsername", () => {
  beforeEach(() => {
    rowsHolder.rows = [];
    callsHolder.calls = [];
  });

  it("awaits connection() before querying", async () => {
    await getSeatsByUsername("3A05");

    expect(vi.mocked(connection)).toHaveBeenCalledTimes(1);
    expect(callsHolder.calls.indexOf("connection")).toBeLessThan(
      callsHolder.calls.indexOf("select"),
    );
  });

  it("selects from the seats table with a username filter", async () => {
    await getSeatsByUsername("3A05");

    expect(callsHolder.calls).toEqual(
      expect.arrayContaining(["select", "from", "where"]),
    );
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1);
  });

  it("returns every matching seat", async () => {
    const seats = [
      makeSeat({ performance: "A", seat: "A-12" }),
      makeSeat({ id: 2, performance: "C", seat: "C-03" }),
    ];
    rowsHolder.rows = seats;

    await expect(getSeatsByUsername("3A05")).resolves.toBe(seats);
  });

  it("returns an empty array when the user has no seats", async () => {
    await expect(getSeatsByUsername("3A05")).resolves.toEqual([]);
  });
});
