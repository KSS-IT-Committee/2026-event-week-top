import { connection } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getLotteryResults } from "@/db/getLotteryResults";
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
    lotteryId: "sousaku-performance",
    slotId: "sep12-slot-1",
    username: "5B21",
    applicantType: "student",
    actId: "6A",
    partySize: 1,
    choiceRank: 1,
    isPriority: false,
    drawnAt: new Date("2026-09-08T00:00:00Z"),
    ...overrides,
  };
}

describe("getLotteryResults", () => {
  beforeEach(() => {
    rowsHolder.rows = [];
    callsHolder.calls = [];
  });

  it("awaits connection() before querying", async () => {
    await getLotteryResults("5B21", "sousaku-performance", "student");
    expect(vi.mocked(connection)).toHaveBeenCalledTimes(1);
    const connectionIndex = callsHolder.calls.indexOf("connection");
    const selectIndex = callsHolder.calls.indexOf("select");
    expect(connectionIndex).toBeGreaterThanOrEqual(0);
    expect(selectIndex).toBeGreaterThanOrEqual(0);
    expect(connectionIndex).toBeLessThan(selectIndex);
  });

  it("selects from the table with a filter (select->from->where)", async () => {
    await getLotteryResults("5B21", "sousaku-performance", "student");
    const selectIndex = callsHolder.calls.indexOf("select");
    const fromIndex = callsHolder.calls.indexOf("from");
    const whereIndex = callsHolder.calls.indexOf("where");
    expect(selectIndex).toBeGreaterThanOrEqual(0);
    expect(selectIndex).toBeLessThan(fromIndex);
    expect(fromIndex).toBeLessThan(whereIndex);
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array when the account won nothing", async () => {
    const result = await getLotteryResults(
      "5B21",
      "sousaku-performance",
      "student",
    );
    expect(result).toEqual([]);
  });

  it("maps every won seat, keeping the rank and 観覧人数", async () => {
    rowsHolder.rows = [
      makeRow(),
      makeRow({
        slotId: "sep13-slot-3",
        actId: "5C",
        partySize: 2,
        choiceRank: 2,
      }),
    ];
    const result = await getLotteryResults(
      "5B21",
      "sousaku-performance",
      "student",
    );
    expect(result).toEqual([
      {
        slotId: "sep12-slot-1",
        actId: "6A",
        partySize: 1,
        choiceRank: 1,
        isPriority: false,
      },
      {
        slotId: "sep13-slot-3",
        actId: "5C",
        partySize: 2,
        choiceRank: 2,
        isPriority: false,
      },
    ]);
  });

  it("carries the 保護者 guarantee flag through", async () => {
    rowsHolder.rows = [makeRow({ applicantType: "parent", isPriority: true })];
    const result = await getLotteryResults(
      "5B21",
      "sousaku-performance",
      "parent",
    );
    expect(result[0].isPriority).toBe(true);
  });
});
