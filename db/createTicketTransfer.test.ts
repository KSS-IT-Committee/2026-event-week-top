import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTicketTransfer } from "@/db/createTicketTransfer";

const { state } = vi.hoisted(() => ({
  state: {
    // Rows the ownership SELECT finds ([] = the seat is not the caller's).
    ticketRows: [] as unknown[],
    // Every chained call on that SELECT, so the FOR UPDATE lock is pinned.
    selectCalls: [] as string[],
    insertValues: [] as unknown[],
    insertError: null as unknown,
  },
}));

vi.mock("@/lib/db", () => {
  function chain(rows: unknown[], record?: string[], error?: unknown) {
    const settled =
      error === undefined || error === null
        ? Promise.resolve(rows)
        : Promise.reject(error);
    settled.catch(() => {});
    const proxy: unknown = new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === "then") return settled.then.bind(settled);
        if (prop === "catch") return settled.catch.bind(settled);
        if (prop === "finally") return settled.finally.bind(settled);
        return (...args: unknown[]) => {
          if (typeof prop === "string") {
            record?.push(prop);
            if (prop === "values") state.insertValues.push(args[0]);
          }
          return proxy;
        };
      },
      apply: () => proxy,
    });
    return proxy;
  }

  const tx = {
    select: () => chain(state.ticketRows, state.selectCalls),
    insert: () => chain([{ id: 31 }], undefined, state.insertError),
  };

  return {
    db: {
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    },
  };
});

function uniqueViolation(constraint: string) {
  return Object.assign(new Error("duplicate key"), {
    code: "23505",
    constraint_name: constraint,
  });
}

describe("createTicketTransfer", () => {
  beforeEach(() => {
    state.ticketRows = [{ id: 42 }];
    state.selectCalls = [];
    state.insertValues = [];
    state.insertError = null;
  });

  it("records a pending offer from the holder to the recipient", async () => {
    expect(await createTicketTransfer(42, "5B21", "4D11")).toEqual({
      ok: true,
      transferId: 31,
    });
    expect(state.insertValues[0]).toEqual({
      resultId: 42,
      fromUsername: "5B21",
      toUsername: "4D11",
    });
  });

  it("leaves the seat where it is — an offer is not a hand-over", async () => {
    await createTicketTransfer(42, "5B21", "4D11");
    // Nothing but the offer row is written; lottery_results is untouched
    // until the recipient claims.
    expect(state.insertValues).toHaveLength(1);
  });

  it("locks the seat while re-checking ownership", async () => {
    await createTicketTransfer(42, "5B21", "4D11");
    expect(state.selectCalls).toContain("for");
  });

  it("refuses a seat the sender no longer holds", async () => {
    state.ticketRows = [];
    expect(await createTicketTransfer(42, "5B21", "4D11")).toEqual({
      ok: false,
      reason: "not-owned",
    });
    expect(state.insertValues).toEqual([]);
  });

  it("reports the seat as already promised when the partial index rejects it", async () => {
    state.insertError = uniqueViolation(
      "lottery_ticket_transfers_one_pending_per_result",
    );
    expect(await createTicketTransfer(42, "5B21", "4D11")).toEqual({
      ok: false,
      reason: "already-pending",
    });
  });

  it("rethrows a unique violation from some other constraint", async () => {
    state.insertError = uniqueViolation("some_other_unique");
    await expect(createTicketTransfer(42, "5B21", "4D11")).rejects.toThrow(
      "duplicate key",
    );
  });
});
