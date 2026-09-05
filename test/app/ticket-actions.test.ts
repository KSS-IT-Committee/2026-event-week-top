import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelTicketTransferAction,
  discardTicketAction,
  offerTicketTransferAction,
  type TicketActionState,
  type TransferRecipientState,
  verifyTransferRecipientAction,
} from "@/app/lottery/results/[ticketId]/actions";
import { createTicketTransfer } from "@/db/createTicketTransfer";
import { deleteLotteryTicket } from "@/db/deleteLotteryTicket";
import { getLotteryTicket } from "@/db/getLotteryTicket";
import type { LotteryTicket } from "@/db/getLotteryTickets";
import { getUserByUsername } from "@/db/getUserByUsername";
import { resolveTicketTransfer } from "@/db/resolveTicketTransfer";
import type { Role } from "@/lib/access";
import { getLottery, getTicketStartsAt, type Lottery } from "@/lib/lotteries";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";

// ── Module mocks ──────────────────────────────────────────────────────────
// lib/lotteries stays real: the actions must validate against the actual
// lottery definitions (announcement gate, per-performance transfer deadline).
vi.mock("@/db/createTicketTransfer", () => ({
  createTicketTransfer: vi.fn(),
}));
vi.mock("@/db/deleteLotteryTicket", () => ({ deleteLotteryTicket: vi.fn() }));
vi.mock("@/db/getLotteryTicket", () => ({ getLotteryTicket: vi.fn() }));
vi.mock("@/db/getUserByUsername", () => ({ getUserByUsername: vi.fn() }));
vi.mock("@/db/resolveTicketTransfer", () => ({
  resolveTicketTransfer: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // The real redirect() throws a control-flow exception; model that so a
    // test can tell "redirected" from "returned a state".
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const RECIPIENT_STATE: TransferRecipientState = {
  error: null,
  verifiedUsername: null,
};
const ACTION_STATE: TicketActionState = { error: null, success: false };

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

function mustGetLottery(lotteryId: string): Lottery {
  const lottery = getLottery(lotteryId);
  if (lottery === null) throw new Error(`missing lottery: ${lotteryId}`);
  return lottery;
}

const SOUSAKU = mustGetLottery("sousaku-performance");

// The ticket every test acts on: 創作部門, 9月12日第一公演.
const TICKET: LotteryTicket = {
  id: 42,
  lotteryId: "sousaku-performance",
  slotId: "sep12-slot-1",
  actId: "6A",
  applicantType: "student",
  partySize: 1,
  choiceRank: 1,
  isPriority: false,
};

function ticketStartsAt(): Date {
  const startsAt = getTicketStartsAt(SOUSAKU, TICKET.slotId, TICKET.actId);
  if (startsAt === null) {
    throw new Error("the fixture ticket's performance has no configured time");
  }
  return startsAt;
}

/**
 * A moment when the seat is both visible and still transferable, derived from
 * the lottery's own config. These tests assume the results ARE published —
 * clearing resultsAnnouncedAt is the kill switch that hides every seat, and
 * with it 譲渡 and 破棄.
 */
function transferableInstant(): Date {
  if (SOUSAKU.resultsAnnouncedAt === null) {
    throw new Error(
      "sousaku-performance has no resultsAnnouncedAt: tickets are hidden, so " +
        "there is nothing to transfer. Re-point these tests if that becomes " +
        "the intended steady state.",
    );
  }
  return new Date(SOUSAKU.resultsAnnouncedAt.getTime() + 60_000);
}

function asUser(username: string, roles: readonly string[] = ["Students"]) {
  vi.mocked(getCurrentUser).mockResolvedValue({ username, roles: [...roles] });
}

function recipientExists(username: string, roles: readonly Role[]) {
  vi.mocked(getUserByUsername).mockResolvedValue({
    username,
    passwordHash: "$2b$12$" + "x".repeat(53),
    hasLoggedIn: true,
    roles: [...roles],
  });
}

// getUserByUsername's inferred return type doesn't include null (Drizzle's
// array destructuring is not undefined-aware), so "no such account" is
// spelled the same way login-actions.test.ts spells it.
function recipientMissing() {
  vi.mocked(getUserByUsername).mockResolvedValue(null as never);
}

beforeEach(() => {
  vi.useFakeTimers({ now: transferableInstant() });
  // clearMocks wipes implementations too, so re-apply the defaults.
  asUser("5B21");
  vi.mocked(checkRateLimit).mockReturnValue({ ok: true, retryAfterSeconds: 0 });
  vi.mocked(getLotteryTicket).mockResolvedValue(TICKET);
  recipientMissing();
  vi.mocked(createTicketTransfer).mockResolvedValue({
    ok: true,
    transferId: 31,
  });
  vi.mocked(resolveTicketTransfer).mockResolvedValue(true);
  vi.mocked(deleteLotteryTicket).mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("verifyTransferRecipientAction", () => {
  it("looks the ticket up as the session user, never as the form says", async () => {
    recipientExists("4D11", ["Students"]);
    await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "4D11" }),
    );
    expect(getLotteryTicket).toHaveBeenCalledWith(42, "5B21");
  });

  it("confirms a school account other than the caller's", async () => {
    recipientExists("4D11", ["G4", "ClassD", "Students"]);
    const state = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: " 4D11 " }),
    );
    expect(state).toEqual({ error: null, verifiedUsername: "4D11" });
  });

  it("accepts a 教職員 account — a ticket may go to anyone in school", async () => {
    recipientExists("k1234567", ["Teachers"]);
    const state = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "k1234567" }),
    );
    expect(state.verifiedUsername).toBe("k1234567");
  });

  it("rejects an account with no school roles the same way as a missing one", async () => {
    recipientExists("committee01", ["IT"]);
    const withoutRoles = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "committee01" }),
    );
    recipientMissing();
    const missing = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "nobody" }),
    );
    expect(withoutRoles.verifiedUsername).toBeNull();
    expect(withoutRoles.error).toBe(missing.error);
  });

  it("refuses to confirm the caller's own account", async () => {
    const state = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "5B21" }),
    );
    expect(state.verifiedUsername).toBeNull();
    expect(state.error).toContain("自分自身");
    expect(getUserByUsername).not.toHaveBeenCalled();
  });

  it("asks for a username when the box is empty", async () => {
    const state = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "   " }),
    );
    expect(state.error).toContain("入力してください");
  });

  it("requires a session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const state = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "4D11" }),
    );
    expect(state.error).toContain("セッション");
    expect(getLotteryTicket).not.toHaveBeenCalled();
  });

  it("treats a ticket the caller does not hold as missing", async () => {
    vi.mocked(getLotteryTicket).mockResolvedValue(null);
    const state = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "4D11" }),
    );
    expect(state.error).toContain("チケットが見つかりません");
  });

  it("hides a seat whose results are not announced yet", async () => {
    if (SOUSAKU.resultsAnnouncedAt === null) return;
    vi.setSystemTime(new Date(SOUSAKU.resultsAnnouncedAt.getTime() - 1));
    const state = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "4D11" }),
    );
    expect(state.error).toContain("チケットが見つかりません");
  });

  it("stops once the performance's 受付 deadline has passed", async () => {
    vi.setSystemTime(ticketStartsAt());
    const state = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "4D11" }),
    );
    expect(state.error).toContain("譲渡受付は終了");
    expect(getUserByUsername).not.toHaveBeenCalled();
  });

  it("throttles lookups so the box cannot enumerate the roster", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      ok: false,
      retryAfterSeconds: 30,
    });
    const state = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "4D11" }),
    );
    expect(state.error).toContain("試行回数");
    expect(checkRateLimit).toHaveBeenCalledWith(
      "ticket-lookup:5B21",
      expect.any(Number),
      expect.any(Number),
    );
    expect(getUserByUsername).not.toHaveBeenCalled();
  });

  it("says nothing about what the recipient already holds", async () => {
    // The check reads `users` only — never lottery_results — so it cannot be
    // used to look up another account's seats.
    recipientExists("4D11", ["Students"]);
    const state = await verifyTransferRecipientAction(
      RECIPIENT_STATE,
      fd({ ticketId: "42", recipient: "4D11" }),
    );
    expect(state).toEqual({ error: null, verifiedUsername: "4D11" });
  });
});

describe("offerTicketTransferAction", () => {
  it("records the offer for the caller's ticket and the named recipient", async () => {
    recipientExists("4D11", ["Students"]);
    const state = await offerTicketTransferAction(
      ACTION_STATE,
      fd({ ticketId: "42", recipient: "4D11" }),
    );
    expect(state).toEqual({ error: null, success: true });
    expect(createTicketTransfer).toHaveBeenCalledWith(42, "5B21", "4D11");
  });

  it("re-validates the recipient rather than trusting the check step", async () => {
    recipientMissing();
    const state = await offerTicketTransferAction(
      ACTION_STATE,
      fd({ ticketId: "42", recipient: "ghost" }),
    );
    expect(state.success).toBe(false);
    expect(createTicketTransfer).not.toHaveBeenCalled();
  });

  it("refuses to send a ticket to its own holder", async () => {
    const state = await offerTicketTransferAction(
      ACTION_STATE,
      fd({ ticketId: "42", recipient: "5B21" }),
    );
    expect(state.success).toBe(false);
    expect(createTicketTransfer).not.toHaveBeenCalled();
  });

  it("explains that a ticket already promised must be cancelled first", async () => {
    recipientExists("4D11", ["Students"]);
    vi.mocked(createTicketTransfer).mockResolvedValue({
      ok: false,
      reason: "already-pending",
    });
    const state = await offerTicketTransferAction(
      ACTION_STATE,
      fd({ ticketId: "42", recipient: "4D11" }),
    );
    expect(state.error).toContain("既に譲渡申請中");
  });

  it("stops once the performance's 受付 deadline has passed", async () => {
    recipientExists("4D11", ["Students"]);
    vi.setSystemTime(ticketStartsAt());
    const state = await offerTicketTransferAction(
      ACTION_STATE,
      fd({ ticketId: "42", recipient: "4D11" }),
    );
    expect(state.error).toContain("譲渡受付は終了");
    expect(createTicketTransfer).not.toHaveBeenCalled();
  });

  it("survives a database failure with a retry message", async () => {
    recipientExists("4D11", ["Students"]);
    vi.mocked(createTicketTransfer).mockRejectedValue(new Error("down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await offerTicketTransferAction(
      ACTION_STATE,
      fd({ ticketId: "42", recipient: "4D11" }),
    );
    expect(state.error).toContain("処理に失敗");
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("cancelTicketTransferAction", () => {
  it("cancels the caller's own offer", async () => {
    const state = await cancelTicketTransferAction(
      ACTION_STATE,
      fd({ transferId: "31" }),
    );
    expect(state).toEqual({ error: null, success: true });
    expect(resolveTicketTransfer).toHaveBeenCalledWith(31, "5B21", "cancelled");
  });

  it("reports an offer that was already claimed or cancelled", async () => {
    vi.mocked(resolveTicketTransfer).mockResolvedValue(false);
    const state = await cancelTicketTransferAction(
      ACTION_STATE,
      fd({ transferId: "31" }),
    );
    expect(state.success).toBe(false);
    expect(state.error).toContain("既に");
  });

  it("stays available after the performance has started", async () => {
    // Cancelling only un-promises a seat, so the deadline must not block it.
    vi.setSystemTime(ticketStartsAt());
    const state = await cancelTicketTransferAction(
      ACTION_STATE,
      fd({ transferId: "31" }),
    );
    expect(state.success).toBe(true);
  });

  it("requires a session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const state = await cancelTicketTransferAction(
      ACTION_STATE,
      fd({ transferId: "31" }),
    );
    expect(state.error).toContain("セッション");
    expect(resolveTicketTransfer).not.toHaveBeenCalled();
  });

  it("rejects a transfer id that is not a number", async () => {
    const state = await cancelTicketTransferAction(
      ACTION_STATE,
      fd({ transferId: "abc" }),
    );
    expect(state.success).toBe(false);
    expect(resolveTicketTransfer).not.toHaveBeenCalled();
  });
});

describe("discardTicketAction", () => {
  it("deletes the caller's ticket and leaves the page", async () => {
    await expect(
      discardTicketAction(ACTION_STATE, fd({ ticketId: "42" })),
    ).rejects.toThrow("NEXT_REDIRECT:/lottery/results");
    expect(deleteLotteryTicket).toHaveBeenCalledWith(42, "5B21");
  });

  it("never deletes a ticket the caller does not hold", async () => {
    vi.mocked(getLotteryTicket).mockResolvedValue(null);
    const state = await discardTicketAction(
      ACTION_STATE,
      fd({ ticketId: "42" }),
    );
    expect(state.error).toContain("チケットが見つかりません");
    expect(deleteLotteryTicket).not.toHaveBeenCalled();
  });

  it("still works after the performance has started", async () => {
    // Throwing away a seat you can no longer use harms nobody.
    vi.setSystemTime(ticketStartsAt());
    await expect(
      discardTicketAction(ACTION_STATE, fd({ ticketId: "42" })),
    ).rejects.toThrow("NEXT_REDIRECT:/lottery/results");
  });

  it("reports a ticket that vanished between render and submit", async () => {
    vi.mocked(deleteLotteryTicket).mockResolvedValue(false);
    const state = await discardTicketAction(
      ACTION_STATE,
      fd({ ticketId: "42" }),
    );
    expect(state.error).toContain("チケットが見つかりません");
  });

  it("requires a session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const state = await discardTicketAction(
      ACTION_STATE,
      fd({ ticketId: "42" }),
    );
    expect(state.error).toContain("セッション");
    expect(deleteLotteryTicket).not.toHaveBeenCalled();
  });
});
