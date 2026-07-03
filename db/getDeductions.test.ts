import { connection } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDeductions } from "@/db/getDeductions";

const { rowsHolder } = vi.hoisted(() => ({
  rowsHolder: { rows: [] as unknown[] },
}));

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

vi.mock("@/lib/db", () => {
  function chain() {
    const p = Promise.resolve(rowsHolder.rows);
    const proxy: unknown = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return p.then.bind(p);
        if (prop === "catch") return p.catch.bind(p);
        if (prop === "finally") return p.finally.bind(p);
        return () => proxy;
      },
      apply: () => proxy,
    });
    return proxy;
  }
  return { db: { select: () => chain() } };
});

describe("getDeductions", () => {
  beforeEach(() => {
    rowsHolder.rows = [];
  });

  it("awaits connection() before querying", async () => {
    rowsHolder.rows = [];
    await getDeductions();
    expect(vi.mocked(connection)).toHaveBeenCalledTimes(1);
  });

  it("converts occurredAt Date to an ISO string", async () => {
    rowsHolder.rows = [
      {
        id: 1,
        className: "3B",
        content: "late",
        points: 5,
        occurredAt: new Date("2026-05-01T00:00:00Z"),
      },
    ];
    const result = await getDeductions();
    expect(result[0].occurredAt).toBe("2026-05-01T00:00:00.000Z");
  });

  it("passes through id, className, content, and points", async () => {
    rowsHolder.rows = [
      {
        id: 42,
        className: "5A",
        content: "noise",
        points: 3,
        occurredAt: new Date("2026-01-02T03:04:05Z"),
        extraIgnored: "x",
      },
    ];
    const result = await getDeductions();
    expect(result).toEqual([
      {
        id: 42,
        className: "5A",
        content: "noise",
        points: 3,
        occurredAt: "2026-01-02T03:04:05.000Z",
      },
    ]);
  });

  it("returns [] for empty rows", async () => {
    rowsHolder.rows = [];
    const result = await getDeductions();
    expect(result).toEqual([]);
  });

  it("maps multiple rows preserving order", async () => {
    rowsHolder.rows = [
      {
        id: 1,
        className: "1A",
        content: "a",
        points: 1,
        occurredAt: new Date("2026-03-03T00:00:00Z"),
      },
      {
        id: 2,
        className: "2B",
        content: "b",
        points: 2,
        occurredAt: new Date("2026-02-02T00:00:00Z"),
      },
    ];
    const result = await getDeductions();
    expect(result.map((r) => r.id)).toEqual([1, 2]);
    expect(result.map((r) => r.occurredAt)).toEqual([
      "2026-03-03T00:00:00.000Z",
      "2026-02-02T00:00:00.000Z",
    ]);
  });

  it("accepts className and limit arguments", async () => {
    rowsHolder.rows = [
      {
        id: 7,
        className: "3B",
        content: "c",
        points: 4,
        occurredAt: new Date("2026-04-04T00:00:00Z"),
      },
    ];
    const result = await getDeductions("3B", 10);
    expect(result[0].className).toBe("3B");
    expect(vi.mocked(connection)).toHaveBeenCalledTimes(1);
  });
});
