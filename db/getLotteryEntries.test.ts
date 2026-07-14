import { connection } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getLotteryEntries } from "@/db/getLotteryEntries";
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

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    lotteryId: "kaitaku-performance",
    slotId: "slot-1",
    username: "3A05",
    applicantType: "parent",
    firstChoice: "3A",
    secondChoice: null,
    thirdChoice: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

describe("getLotteryEntries", () => {
  beforeEach(() => {
    rowsHolder.rows = [];
    callsHolder.calls = [];
  });

  it("awaits connection() before querying", async () => {
    await getLotteryEntries("3A05", "kaitaku-performance", "parent");
    expect(vi.mocked(connection)).toHaveBeenCalledTimes(1);
    const connectionIndex = callsHolder.calls.indexOf("connection");
    const selectIndex = callsHolder.calls.indexOf("select");
    expect(connectionIndex).toBeGreaterThanOrEqual(0);
    expect(selectIndex).toBeGreaterThanOrEqual(0);
    expect(connectionIndex).toBeLessThan(selectIndex);
  });

  it("selects from the table with a filter (select->from->where)", async () => {
    await getLotteryEntries("3A05", "kaitaku-performance", "parent");
    const selectIndex = callsHolder.calls.indexOf("select");
    const fromIndex = callsHolder.calls.indexOf("from");
    const whereIndex = callsHolder.calls.indexOf("where");
    expect(selectIndex).toBeGreaterThanOrEqual(0);
    expect(selectIndex).toBeLessThan(fromIndex);
    expect(fromIndex).toBeLessThan(whereIndex);
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array when nothing is saved", async () => {
    const result = await getLotteryEntries(
      "3A05",
      "kaitaku-performance",
      "parent",
    );
    expect(result).toEqual([]);
  });

  it("maps a fully ranked row to a three-choice summary", async () => {
    rowsHolder.rows = [
      makeRow({ firstChoice: "3A", secondChoice: "3B", thirdChoice: "4C" }),
    ];
    const result = await getLotteryEntries(
      "3A05",
      "kaitaku-performance",
      "parent",
    );
    expect(result).toEqual([{ slotId: "slot-1", choices: ["3A", "3B", "4C"] }]);
  });

  it("omits unused ranks from the choices array", async () => {
    rowsHolder.rows = [
      makeRow({ slotId: "slot-2", firstChoice: "4A" }),
      makeRow({
        slotId: "slot-3",
        firstChoice: "3C",
        secondChoice: "3D",
      }),
    ];
    const result = await getLotteryEntries(
      "3A05",
      "kaitaku-performance",
      "parent",
    );
    expect(result).toEqual([
      { slotId: "slot-2", choices: ["4A"] },
      { slotId: "slot-3", choices: ["3C", "3D"] },
    ]);
  });
});
