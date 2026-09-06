import { connection } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getLotteryTickets } from "@/db/getLotteryTickets";
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

describe("getLotteryTickets", () => {
  beforeEach(() => {
    rowsHolder.rows = [];
    callsHolder.calls = [];
  });

  it("awaits connection() before querying", async () => {
    await getLotteryTickets("5B21");
    expect(vi.mocked(connection)).toHaveBeenCalledTimes(1);
    const connectionIndex = callsHolder.calls.indexOf("connection");
    const selectIndex = callsHolder.calls.indexOf("select");
    expect(connectionIndex).toBeGreaterThanOrEqual(0);
    expect(selectIndex).toBeGreaterThanOrEqual(0);
    expect(connectionIndex).toBeLessThan(selectIndex);
  });

  it("selects from the table with a filter (select->from->where)", async () => {
    await getLotteryTickets("5B21");
    const selectIndex = callsHolder.calls.indexOf("select");
    const fromIndex = callsHolder.calls.indexOf("from");
    const whereIndex = callsHolder.calls.indexOf("where");
    expect(selectIndex).toBeGreaterThanOrEqual(0);
    expect(selectIndex).toBeLessThan(fromIndex);
    expect(fromIndex).toBeLessThan(whereIndex);
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array when the account holds no seat", async () => {
    expect(await getLotteryTickets("5B21")).toEqual([]);
  });

  it("exposes the row id, which is the ticket's page and transfer handle", async () => {
    rowsHolder.rows = [makeRow({ id: 412 })];
    expect((await getLotteryTickets("5B21"))[0].id).toBe(412);
  });

  it("maps every seat, keeping the rank and 観覧人数", async () => {
    rowsHolder.rows = [
      makeRow(),
      makeRow({
        id: 2,
        slotId: "sep13-slot-3",
        actId: "5C",
        partySize: 2,
        choiceRank: 2,
      }),
    ];
    expect(await getLotteryTickets("5B21")).toEqual([
      {
        id: 1,
        lotteryId: "sousaku-performance",
        slotId: "sep12-slot-1",
        actId: "6A",
        applicantType: "student",
        partySize: 1,
        choiceRank: 1,
        isPriority: false,
      },
      {
        id: 2,
        lotteryId: "sousaku-performance",
        slotId: "sep13-slot-3",
        actId: "5C",
        applicantType: "student",
        partySize: 2,
        choiceRank: 2,
        isPriority: false,
      },
    ]);
  });

  it("carries the 保護者 guarantee flag through", async () => {
    rowsHolder.rows = [makeRow({ applicantType: "parent", isPriority: true })];
    const tickets = await getLotteryTickets("5B21");
    expect(tickets[0].isPriority).toBe(true);
    expect(tickets[0].applicantType).toBe("parent");
  });

  it("returns seats from every lottery and 区分 the account holds, including transferred-in ones", async () => {
    // A 教職員 account can only enter as 本人, yet may hold a 保護者 seat
    // someone gave it — the query must not filter those away.
    rowsHolder.rows = [
      makeRow({ id: 1, lotteryId: "sousaku-performance" }),
      makeRow({
        id: 2,
        lotteryId: "kaitaku-performance",
        slotId: "sep12",
        actId: "performance-3",
        applicantType: "parent",
      }),
    ];
    const tickets = await getLotteryTickets("k1234567");
    expect(tickets.map((ticket) => ticket.lotteryId)).toEqual([
      "sousaku-performance",
      "kaitaku-performance",
    ]);
    expect(tickets[1].applicantType).toBe("parent");
  });
});
