import { beforeEach, describe, expect, it, vi } from "vitest";

import { claimTicketTransfer } from "@/db/claimTicketTransfer";

const { state } = vi.hoisted(() => ({
  state: {
    // Rows returned by consecutive tx.select() calls: the offer, the seat,
    // then the conflicting seat lookup.
    selects: [] as unknown[][],
    // Every chained call made on a select, so the FOR UPDATE locks can be
    // pinned — they are what makes a double-claim queue instead of racing.
    selectCalls: [] as string[],
    // [table-ish marker, payload] per tx.update(...).set(...).
    updates: [] as unknown[],
    // Thrown by the first update, to model a unique-constraint race.
    updateError: null as unknown,
  },
}));

vi.mock("@/lib/db", () => {
  function chain(rows: unknown[], record?: string[], error?: unknown) {
    const settled =
      error === undefined || error === null
        ? Promise.resolve(rows)
        : Promise.reject(error);
    // Swallow the "unhandled rejection" warning for a promise that IS awaited
    // later in the same task.
    settled.catch(() => {});
    const proxy: unknown = new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === "then") return settled.then.bind(settled);
        if (prop === "catch") return settled.catch.bind(settled);
        if (prop === "finally") return settled.finally.bind(settled);
        return (...args: unknown[]) => {
          if (typeof prop === "string") {
            record?.push(prop);
            if (prop === "set") state.updates.push(args[0]);
          }
          return proxy;
        };
      },
      apply: () => proxy,
    });
    return proxy;
  }

  const tx = {
    select: () => chain(state.selects.shift() ?? [], state.selectCalls),
    update: () => {
      const error = state.updates.length === 0 ? state.updateError : null;
      return chain([], undefined, error);
    },
  };

  return {
    db: {
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    },
  };
});

const OFFER = [{ id: 7, resultId: 42 }];
const TICKET = [
  {
    id: 42,
    lotteryId: "sousaku-performance",
    slotId: "sep12-slot-1",
    username: "5B21",
    applicantType: "parent",
    actId: "6A",
    partySize: 2,
    choiceRank: 1,
    isPriority: true,
    drawnAt: new Date("2026-08-26T00:00:00Z"),
  },
];

function uniqueViolation(constraint: string) {
  return Object.assign(new Error("duplicate key"), {
    code: "23505",
    constraint_name: constraint,
  });
}

describe("claimTicketTransfer", () => {
  beforeEach(() => {
    state.selects = [];
    state.selectCalls = [];
    state.updates = [];
    state.updateError = null;
  });

  it("moves the seat to the recipient and resolves the offer", async () => {
    state.selects = [OFFER, TICKET, []];
    const result = await claimTicketTransfer(7, "4D11");

    expect(result).toEqual({
      ok: true,
      ticket: {
        id: 42,
        lotteryId: "sousaku-performance",
        slotId: "sep12-slot-1",
        actId: "6A",
        applicantType: "parent",
        partySize: 2,
        choiceRank: 1,
        isPriority: false,
      },
    });
    expect(state.updates[0]).toEqual({ username: "4D11", isPriority: false });
    expect(state.updates[1]).toMatchObject({ status: "claimed" });
    expect(
      (state.updates[1] as { resolvedAt: Date }).resolvedAt,
    ).toBeInstanceOf(Date);
  });

  it("clears the child's-class guarantee, which was about the old holder", async () => {
    state.selects = [OFFER, TICKET, []];
    const result = await claimTicketTransfer(7, "4D11");
    expect(result.ok && result.ticket.isPriority).toBe(false);
    expect(state.updates[0]).toMatchObject({ isPriority: false });
  });

  it("locks the offer and the seat it names", async () => {
    state.selects = [OFFER, TICKET, []];
    await claimTicketTransfer(7, "4D11");
    // Two of the three selects take a row lock; the conflict lookup does not.
    expect(state.selectCalls.filter((call) => call === "for")).toHaveLength(2);
  });

  it("reports not-found when there is no pending offer for this account", async () => {
    state.selects = [[], TICKET, []];
    expect(await claimTicketTransfer(7, "4D11")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(state.updates).toEqual([]);
  });

  it("reports not-found when the seat behind the offer is gone", async () => {
    state.selects = [OFFER, [], []];
    expect(await claimTicketTransfer(7, "4D11")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(state.updates).toEqual([]);
  });

  it("refuses a seat for a performance the recipient already has in that 区分", async () => {
    state.selects = [OFFER, TICKET, [{ id: 99 }]];
    expect(await claimTicketTransfer(7, "4D11")).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(state.updates).toEqual([]);
  });

  it("turns a lost unique-key race into the same conflict answer", async () => {
    state.selects = [OFFER, TICKET, []];
    state.updateError = uniqueViolation(
      "lottery_results_slot_applicant_unique",
    );
    expect(await claimTicketTransfer(7, "4D11")).toEqual({
      ok: false,
      reason: "conflict",
    });
  });

  it("rethrows anything that is not that race", async () => {
    state.selects = [OFFER, TICKET, []];
    state.updateError = new Error("connection reset");
    await expect(claimTicketTransfer(7, "4D11")).rejects.toThrow(
      "connection reset",
    );
  });
});
