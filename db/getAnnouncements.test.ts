import { connection } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAnnouncements } from "@/db/getAnnouncements";

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

function expandedRows() {
  return [
    {
      id: 1,
      title: "T1",
      body: "B1",
      createdAt: new Date("2026-03-01T00:00:00Z"),
      className: "3B",
    },
    {
      id: 1,
      title: "T1",
      body: "B1",
      createdAt: new Date("2026-03-01T00:00:00Z"),
      className: "3C",
    },
    {
      id: 2,
      title: "T2",
      body: "B2",
      createdAt: new Date("2026-02-01T00:00:00Z"),
      className: null,
    },
    {
      id: 3,
      title: "T3",
      body: "B3",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      className: "3B",
    },
  ];
}

describe("getAnnouncements", () => {
  beforeEach(() => {
    rowsHolder.rows = [];
  });

  it("awaits connection() before querying", async () => {
    rowsHolder.rows = [];
    await getAnnouncements();
    expect(vi.mocked(connection)).toHaveBeenCalledTimes(1);
  });

  it("collapses expanded join rows into one entry per id with classes", async () => {
    rowsHolder.rows = expandedRows();
    const result = await getAnnouncements();
    expect(result.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(result[0].classes).toEqual(["3B", "3C"]);
    expect(result[1].classes).toEqual([]);
    expect(result[2].classes).toEqual(["3B"]);
  });

  it("converts createdAt to ISO strings and preserves title/body", async () => {
    rowsHolder.rows = expandedRows();
    const result = await getAnnouncements();
    expect(result[0]).toMatchObject({
      id: 1,
      title: "T1",
      body: "B1",
      createdAt: "2026-03-01T00:00:00.000Z",
    });
    expect(result[1].createdAt).toBe("2026-02-01T00:00:00.000Z");
    expect(result[2].createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("filters to announcements whose classes include the given className (3B)", async () => {
    rowsHolder.rows = expandedRows();
    const result = await getAnnouncements("3B");
    expect(result.map((a) => a.id)).toEqual([1, 3]);
  });

  it("excludes class-less announcements when filtering (not global)", async () => {
    rowsHolder.rows = expandedRows();
    const result = await getAnnouncements("3C");
    expect(result.map((a) => a.id)).toEqual([1]);
  });

  it("returns [] when no announcement targets the className", async () => {
    rowsHolder.rows = expandedRows();
    const result = await getAnnouncements("9Z" as never);
    expect(result).toEqual([]);
  });

  it("returns [] for empty rows", async () => {
    rowsHolder.rows = [];
    const result = await getAnnouncements();
    expect(result).toEqual([]);
  });

  it("applies slice(0, limit)", async () => {
    rowsHolder.rows = expandedRows();
    const result = await getAnnouncements(undefined, 2);
    expect(result.map((a) => a.id)).toEqual([1, 2]);
  });
});
