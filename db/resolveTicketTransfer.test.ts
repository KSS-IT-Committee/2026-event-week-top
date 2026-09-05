import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveTicketTransfer } from "@/db/resolveTicketTransfer";
import { lotteryTicketTransfers } from "@/db/schema";

const { state } = vi.hoisted(() => ({
  state: {
    updatedRows: [] as unknown[],
    setPayloads: [] as unknown[],
    whereArgs: [] as unknown[],
  },
}));

vi.mock("@/lib/db", () => {
  function chain() {
    const settled = Promise.resolve(state.updatedRows);
    const proxy: unknown = new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === "then") return settled.then.bind(settled);
        if (prop === "catch") return settled.catch.bind(settled);
        if (prop === "finally") return settled.finally.bind(settled);
        return (...args: unknown[]) => {
          if (prop === "set") state.setPayloads.push(args[0]);
          if (prop === "where") state.whereArgs.push(args[0]);
          return proxy;
        };
      },
      apply: () => proxy,
    });
    return proxy;
  }
  return { db: { update: vi.fn(() => chain()) } };
});

// The WHERE clause is a Drizzle SQL tree. Walk only its `queryChunks` —
// following arbitrary object properties instead would wander into a column's
// back-reference to its table (and from there to every other column, making
// the assertion vacuously true).
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

describe("resolveTicketTransfer", () => {
  beforeEach(() => {
    state.updatedRows = [{ id: 7 }];
    state.setPayloads = [];
    state.whereArgs = [];
  });

  it("cancels against the sender's column", async () => {
    expect(await resolveTicketTransfer(7, "5B21", "cancelled")).toBe(true);
    expect(state.setPayloads[0]).toMatchObject({ status: "cancelled" });
    expect(
      mentionsColumn(state.whereArgs[0], lotteryTicketTransfers.fromUsername),
    ).toBe(true);
    expect(
      mentionsColumn(state.whereArgs[0], lotteryTicketTransfers.toUsername),
    ).toBe(false);
  });

  it("declines against the recipient's column", async () => {
    expect(await resolveTicketTransfer(7, "4D11", "declined")).toBe(true);
    expect(state.setPayloads[0]).toMatchObject({ status: "declined" });
    expect(
      mentionsColumn(state.whereArgs[0], lotteryTicketTransfers.toUsername),
    ).toBe(true);
    expect(
      mentionsColumn(state.whereArgs[0], lotteryTicketTransfers.fromUsername),
    ).toBe(false);
  });

  it("targets one pending offer, not every row the actor owns", async () => {
    // Without the id and status predicates this UPDATE is a mass-cancel: it
    // would resolve every offer the actor has ever made or received.
    await resolveTicketTransfer(7, "5B21", "cancelled");
    expect(mentionsColumn(state.whereArgs[0], lotteryTicketTransfers.id)).toBe(
      true,
    );
    expect(
      mentionsColumn(state.whereArgs[0], lotteryTicketTransfers.status),
    ).toBe(true);
  });

  it("stamps resolved_at, which the schema ties to leaving 'pending'", async () => {
    await resolveTicketTransfer(7, "5B21", "cancelled");
    expect(
      (state.setPayloads[0] as { resolvedAt: Date }).resolvedAt,
    ).toBeInstanceOf(Date);
  });

  it("reports false when the offer was already resolved or is not the actor's", async () => {
    state.updatedRows = [];
    expect(await resolveTicketTransfer(7, "5B21", "cancelled")).toBe(false);
  });
});
