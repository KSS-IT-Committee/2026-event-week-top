import { beforeEach, describe, expect, it, vi } from "vitest";

import { claimTicketTransfer } from "@/db/claimTicketTransfer";
import { lotteryResults, lotteryTicketTransfers } from "@/db/schema";

const { state } = vi.hoisted(() => ({
  state: {
    // Rows returned by consecutive tx.select() calls: the offer, the seat,
    // then the conflicting seat lookup.
    selects: [] as unknown[][],
    // Every chained call made on a select, so the FOR UPDATE locks can be
    // pinned — they are what makes a double-claim queue instead of racing.
    selectCalls: [] as string[],
    // One entry per tx.select(), in order: whether it took a row lock, and
    // the WHERE it was given. The mock replays rows by call order and cannot
    // otherwise see what was asked for, so without this a deleted predicate —
    // the ownership scoping this whole function rests on — passes unnoticed.
    selectLogs: [] as { hasLock: boolean; where: unknown }[],
    // Payload of each tx.update(...).set(...), in order.
    updates: [] as unknown[],
    // Raw SQL run through tx.execute — the deferral the exchange needs.
    executed: [] as string[],
    // Thrown by the first update, to model a unique-constraint race.
    updateError: null as unknown,
  },
}));

vi.mock("@/lib/db", () => {
  function chain(
    rows: unknown[],
    record?: string[],
    error?: unknown,
    log?: { hasLock: boolean; where: unknown },
  ) {
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
            if (prop === "where" && log !== undefined) log.where = args[0];
            if (prop === "for" && log !== undefined) log.hasLock = true;
          }
          return proxy;
        };
      },
      apply: () => proxy,
    });
    return proxy;
  }

  const tx = {
    select: () => {
      const log = { hasLock: false, where: undefined as unknown };
      state.selectLogs.push(log);
      return chain(
        state.selects.shift() ?? [],
        state.selectCalls,
        undefined,
        log,
      );
    },
    update: () => {
      const error = state.updates.length === 0 ? state.updateError : null;
      return chain([], undefined, error);
    },
    execute: async (query: { queryChunks?: unknown[] }) => {
      state.executed.push(
        (query.queryChunks ?? [])
          .map((chunk) => String((chunk as { value?: unknown }).value ?? ""))
          .join(""),
      );
    },
  };

  return {
    db: {
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    },
  };
});

const OFFER = [{ id: 7, resultId: 42 }];
// The unlocked peek that now precedes the seat lock.
const PEEK = [{ resultId: 42 }];
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

// The WHERE is a Drizzle SQL tree. Walk only its `queryChunks` — following
// arbitrary object properties would wander into a column's back-reference to
// its table, and from there to every other column, making any assertion
// vacuously true.
function leavesOf(node: unknown, out: unknown[] = []): unknown[] {
  if (node === null || typeof node !== "object") return out;
  const { queryChunks } = node as { queryChunks?: unknown };
  if (Array.isArray(queryChunks)) {
    for (const chunk of queryChunks) leavesOf(chunk, out);
    return out;
  }
  out.push(node);
  return out;
}

function mentionsColumn(where: unknown, column: unknown): boolean {
  return leavesOf(where).includes(column);
}

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
    state.selectLogs = [];
    state.updates = [];
    state.executed = [];
    state.updateError = null;
  });

  it("moves the seat to the recipient and resolves the offer", async () => {
    state.selects = [PEEK, TICKET, OFFER, []];
    const result = await claimTicketTransfer(7, "4D11");

    expect(result).toEqual({
      ok: true,
      exchanged: false,
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
    state.selects = [PEEK, TICKET, OFFER, []];
    const result = await claimTicketTransfer(7, "4D11");
    expect(result.ok && result.ticket.isPriority).toBe(false);
    expect(state.updates[0]).toMatchObject({ isPriority: false });
  });

  it("locks the seat before the offer, matching the order 破棄 forces", async () => {
    state.selects = [PEEK, TICKET, OFFER, []];
    await claimTicketTransfer(7, "4D11");
    // Unlocked peek → seat → offer → conflicting seat. deleteLotteryTicket
    // takes the seat and cascades into its offers, so anything locking an
    // offer first would invert that and could deadlock against a 破棄. Moving
    // the lock onto the peek flips the first two entries and fails here.
    expect(state.selectLogs.map((log) => log.hasLock)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect(mentionsColumn(state.selectLogs[1].where, lotteryResults.id)).toBe(
      true,
    );
  });

  it("scopes both reads of the offer to the account claiming it", async () => {
    // The whole ownership decision is this predicate: without it any logged-in
    // account could claim any pending transfer id.
    state.selects = [PEEK, TICKET, OFFER, []];
    await claimTicketTransfer(7, "4D11");
    for (const index of [0, 2]) {
      expect(
        mentionsColumn(
          state.selectLogs[index].where,
          lotteryTicketTransfers.toUsername,
        ),
      ).toBe(true);
    }
  });

  it("looks for a conflicting seat held by the claimer, not by anyone", async () => {
    state.selects = [PEEK, TICKET, OFFER, []];
    await claimTicketTransfer(7, "4D11");
    expect(
      mentionsColumn(state.selectLogs[3].where, lotteryResults.username),
    ).toBe(true);
  });

  it("re-reads the offer under the lock, so a cancel in between still wins", async () => {
    // The peek finds it pending; by the time the seat is locked it is gone.
    state.selects = [PEEK, TICKET, [], []];
    expect(await claimTicketTransfer(7, "4D11")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(state.updates).toEqual([]);
  });

  it("reports not-found when there is no pending offer for this account", async () => {
    state.selects = [[], TICKET, OFFER, []];
    expect(await claimTicketTransfer(7, "4D11")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(state.updates).toEqual([]);
  });

  it("reports not-found when the seat behind the offer is gone", async () => {
    state.selects = [PEEK, [], OFFER, []];
    expect(await claimTicketTransfer(7, "4D11")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(state.updates).toEqual([]);
  });

  it("refuses a seat for a performance the recipient already has in that 区分", async () => {
    // Blocking seat present, and it is NOT promised back to the sender.
    state.selects = [PEEK, TICKET, OFFER, [{ id: 99 }], []];
    expect(await claimTicketTransfer(7, "4D11")).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(state.updates).toEqual([]);
    expect(state.executed).toEqual([]);
  });

  it("exchanges instead, when the blocking seat is promised back to the sender", async () => {
    // 4D11 holds seat 99 for the same performance and has already offered it
    // to 5B21 — the very account offering seat 42. Both pressed 譲渡する, so
    // the two seats cross over.
    state.selects = [
      PEEK,
      TICKET,
      OFFER,
      [{ id: 99 }],
      [{ id: 8, resultId: 99 }],
    ];
    const result = await claimTicketTransfer(7, "4D11");

    expect(result.ok && result.exchanged).toBe(true);
    // Incoming seat to the claimer, outgoing seat to the original holder.
    expect(state.updates[0]).toEqual({ username: "4D11", isPriority: false });
    expect(state.updates[2]).toEqual({ username: "5B21", isPriority: false });
    // Both offers close, so neither is left dangling.
    expect(state.updates[1]).toMatchObject({ status: "claimed" });
    expect(state.updates[3]).toMatchObject({ status: "claimed" });
  });

  it("defers the one-seat-per-slot key so the two rows can cross", async () => {
    state.selects = [
      PEEK,
      TICKET,
      OFFER,
      [{ id: 99 }],
      [{ id: 8, resultId: 99 }],
    ];
    await claimTicketTransfer(7, "4D11");
    expect(state.executed.join(" ")).toContain(
      'SET CONSTRAINTS "lottery_results_slot_applicant_unique" DEFERRED',
    );
  });

  it("never defers the key on an ordinary hand-over", async () => {
    state.selects = [PEEK, TICKET, OFFER, []];
    await claimTicketTransfer(7, "4D11");
    expect(state.executed).toEqual([]);
  });

  it("locks every row the exchange touches, in seat-before-offer order", async () => {
    state.selects = [
      PEEK,
      TICKET,
      OFFER,
      [{ id: 99 }],
      [{ id: 8, resultId: 99 }],
    ];
    await claimTicketTransfer(7, "4D11");
    // Peek → seat, offer, counter-seat, counter-offer. Both seats are locked
    // before their own offers, so a 破棄 racing the exchange queues rather
    // than deadlocking.
    expect(state.selectLogs.map((log) => log.hasLock)).toEqual([
      false,
      true,
      true,
      true,
      true,
    ]);
  });

  it("requires the counter-offer to run back to this offer's sender", async () => {
    // Mutual consent is the entire justification for forgiving the conflict;
    // without both predicates any pending offer on the blocking seat would do.
    state.selects = [
      PEEK,
      TICKET,
      OFFER,
      [{ id: 99 }],
      [{ id: 8, resultId: 99 }],
    ];
    await claimTicketTransfer(7, "4D11");
    const where = state.selectLogs[4].where;
    expect(mentionsColumn(where, lotteryTicketTransfers.fromUsername)).toBe(
      true,
    );
    expect(mentionsColumn(where, lotteryTicketTransfers.toUsername)).toBe(true);
  });

  it("turns a lost unique-key race into the same conflict answer", async () => {
    state.selects = [PEEK, TICKET, OFFER, []];
    state.updateError = uniqueViolation(
      "lottery_results_slot_applicant_unique",
    );
    expect(await claimTicketTransfer(7, "4D11")).toEqual({
      ok: false,
      reason: "conflict",
    });
  });

  it("rethrows anything that is not that race", async () => {
    state.selects = [PEEK, TICKET, OFFER, []];
    state.updateError = new Error("connection reset");
    await expect(claimTicketTransfer(7, "4D11")).rejects.toThrow(
      "connection reset",
    );
  });
});
