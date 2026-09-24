import { connection } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAnnouncements } from "@/db/getAnnouncements";

const { state } = vi.hoisted(() => ({
  state: {
    // One entry per query the function issues, in order: the id/date pass
    // first, then the join that fetches those announcements' classes.
    results: [] as unknown[][],
    calls: [] as { method: string; args: unknown[] }[][],
  },
}));

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

vi.mock("@/lib/db", () => {
  // Records the builder methods each query chains, so a test can assert that
  // the filter and the limit were pushed into SQL rather than applied in JS.
  function chain(queryIndex: number) {
    const log: { method: string; args: unknown[] }[] = [];
    state.calls[queryIndex] = log;
    const rows = () => state.results[queryIndex] ?? [];
    const proxy: unknown = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then" || prop === "catch" || prop === "finally") {
          const settled: Promise<unknown[]> = Promise.resolve(rows());
          if (prop === "then") return settled.then.bind(settled);
          if (prop === "catch") return settled.catch.bind(settled);
          return settled.finally.bind(settled);
        }
        return (...args: unknown[]) => {
          log.push({ method: String(prop), args });
          return proxy;
        };
      },
      apply: () => proxy,
    });
    return proxy;
  }
  let queryIndex = -1;
  const next = (method: string) => {
    queryIndex += 1;
    const c = chain(queryIndex);
    state.calls[queryIndex].push({ method, args: [] });
    return c;
  };
  return {
    db: {
      select: () => next("select"),
      selectDistinct: () => next("selectDistinct"),
      __reset: () => {
        queryIndex = -1;
      },
    },
  };
});

const { db } = await import("@/lib/db");

function selectedRows() {
  return [
    { id: 1, createdAt: new Date("2026-03-01T00:00:00Z") },
    { id: 2, createdAt: new Date("2026-02-01T00:00:00Z") },
    { id: 3, createdAt: new Date("2026-01-01T00:00:00Z") },
  ];
}

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

function methodsOf(queryIndex: number): string[] {
  return (state.calls[queryIndex] ?? []).map((c) => c.method);
}

function argsOf(queryIndex: number, method: string): unknown[] | undefined {
  return (state.calls[queryIndex] ?? []).find((c) => c.method === method)?.args;
}

describe("getAnnouncements", () => {
  beforeEach(() => {
    state.results = [];
    state.calls = [];
    (db as unknown as { __reset: () => void }).__reset();
    vi.mocked(connection).mockClear();
  });

  it("awaits connection() before querying", async () => {
    await getAnnouncements();
    expect(vi.mocked(connection)).toHaveBeenCalledTimes(1);
  });

  it("collapses expanded join rows into one entry per id with classes", async () => {
    state.results = [selectedRows(), expandedRows()];
    const result = await getAnnouncements();
    expect(result.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(result[0].classes).toEqual(["3B", "3C"]);
    expect(result[1].classes).toEqual([]);
    expect(result[2].classes).toEqual(["3B"]);
  });

  it("converts createdAt to ISO strings and preserves title/body", async () => {
    state.results = [selectedRows(), expandedRows()];
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

  it("filters by className in SQL, not in JavaScript", async () => {
    state.results = [[selectedRows()[0]], expandedRows().slice(0, 2)];
    await getAnnouncements("3B");

    // The class filter is an inner join + where on the first query, so the
    // database never ships announcements the caller cannot see.
    expect(methodsOf(0)).toContain("selectDistinct");
    expect(methodsOf(0)).toContain("innerJoin");
    expect(methodsOf(0)).toContain("where");
  });

  it("pushes the limit into SQL rather than slicing after the fact", async () => {
    state.results = [selectedRows().slice(0, 2), expandedRows().slice(0, 3)];
    await getAnnouncements(undefined, 2);

    expect(methodsOf(0)).toContain("limit");
    expect(argsOf(0, "limit")).toEqual([2]);
  });

  it("defaults the SQL limit to 20", async () => {
    state.results = [selectedRows(), expandedRows()];
    await getAnnouncements();
    expect(argsOf(0, "limit")).toEqual([20]);
  });

  it("skips the second query entirely when nothing matched", async () => {
    state.results = [[], expandedRows()];
    const result = await getAnnouncements("9Z" as never);
    expect(result).toEqual([]);
    // Only the id pass ran — no point joining classes for zero announcements.
    expect(state.calls).toHaveLength(1);
  });

  it("returns [] for empty rows", async () => {
    state.results = [[], []];
    expect(await getAnnouncements()).toEqual([]);
  });

  it("does not use selectDistinct when no className is given", async () => {
    state.results = [selectedRows(), expandedRows()];
    await getAnnouncements();
    expect(methodsOf(0)).toContain("select");
    expect(methodsOf(0)).not.toContain("innerJoin");
  });
});
