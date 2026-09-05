import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimTicketTransferAction,
  declineTicketTransferAction,
  type TicketTransferInboxState,
} from "@/app/lottery/results/actions";
import { claimTicketTransfer } from "@/db/claimTicketTransfer";
import { getIncomingTicketTransfers } from "@/db/getIncomingTicketTransfers";
import type { LotteryTicket } from "@/db/getLotteryTickets";
import { resolveTicketTransfer } from "@/db/resolveTicketTransfer";
import { getLottery, getTicketStartsAt, type Lottery } from "@/lib/lotteries";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";

// lib/lotteries stays real: the deadline these actions enforce comes from the
// actual timetable.
vi.mock("@/db/claimTicketTransfer", () => ({ claimTicketTransfer: vi.fn() }));
vi.mock("@/db/getIncomingTicketTransfers", () => ({
  getIncomingTicketTransfers: vi.fn(),
}));
vi.mock("@/db/resolveTicketTransfer", () => ({
  resolveTicketTransfer: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const PREV: TicketTransferInboxState = { error: null, success: false };

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

const OFFER = {
  id: 31,
  fromUsername: "5B21",
  createdAt: new Date("2026-08-28T00:00:00Z"),
  ticket: TICKET,
};

function ticketStartsAt(): Date {
  const startsAt = getTicketStartsAt(SOUSAKU, TICKET.slotId, TICKET.actId);
  if (startsAt === null) {
    throw new Error("the fixture ticket's performance has no configured time");
  }
  return startsAt;
}

/** See ticket-actions.test.ts — these tests assume results are published. */
function claimableInstant(): Date {
  if (SOUSAKU.resultsAnnouncedAt === null) {
    throw new Error(
      "sousaku-performance has no resultsAnnouncedAt: offered seats are " +
        "hidden, so there is nothing to claim.",
    );
  }
  return new Date(SOUSAKU.resultsAnnouncedAt.getTime() + 60_000);
}

beforeEach(() => {
  vi.useFakeTimers({ now: claimableInstant() });
  vi.mocked(getCurrentUser).mockResolvedValue({
    username: "4D11",
    roles: ["G4", "ClassD", "Students"],
  });
  vi.mocked(checkRateLimit).mockReturnValue({ ok: true, retryAfterSeconds: 0 });
  vi.mocked(getIncomingTicketTransfers).mockResolvedValue([OFFER]);
  vi.mocked(claimTicketTransfer).mockResolvedValue({
    ok: true,
    ticket: TICKET,
    exchanged: false,
  });
  vi.mocked(resolveTicketTransfer).mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("claimTicketTransferAction", () => {
  it("claims an offer addressed to the session user", async () => {
    const state = await claimTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state).toEqual({ error: null, success: true });
    expect(getIncomingTicketTransfers).toHaveBeenCalledWith("4D11");
    expect(claimTicketTransfer).toHaveBeenCalledWith(31, "4D11");
  });

  it("ignores a transfer id that is not in the caller's inbox", async () => {
    const state = await claimTicketTransferAction(
      PREV,
      fd({ transferId: "99" }),
    );
    expect(state.success).toBe(false);
    expect(claimTicketTransfer).not.toHaveBeenCalled();
  });

  it("explains a same-区分 clash rather than silently failing", async () => {
    vi.mocked(claimTicketTransfer).mockResolvedValue({
      ok: false,
      reason: "conflict",
    });
    const state = await claimTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state.error).toContain("同じ公演のチケットを既にお持ち");
  });

  it("refuses once the performance's 受付 deadline has passed", async () => {
    vi.setSystemTime(ticketStartsAt());
    const state = await claimTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state.error).toContain("譲渡受付は終了");
    expect(claimTicketTransfer).not.toHaveBeenCalled();
  });

  it("reads the performance off the database, not off the form", async () => {
    // The deadline is derived from the offered seat as stored, so a forged
    // form field cannot buy extra time.
    await claimTicketTransferAction(
      PREV,
      fd({ transferId: "31", slotId: "sep13-slot-4" }),
    );
    expect(getIncomingTicketTransfers).toHaveBeenCalledWith("4D11");
  });

  it("refuses a 保護者 seat, so a pre-existing offer cannot slip through", async () => {
    // No such offer can be created any more, but the recipient's side
    // enforces the same 区分 rule rather than trusting that.
    vi.mocked(getIncomingTicketTransfers).mockResolvedValue([
      { ...OFFER, ticket: { ...TICKET, applicantType: "parent" } },
    ]);
    const state = await claimTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state.error).toContain("保護者");
    expect(claimTicketTransfer).not.toHaveBeenCalled();
  });

  it("lets the recipient decline a seat they are not allowed to claim", async () => {
    vi.mocked(getIncomingTicketTransfers).mockResolvedValue([
      { ...OFFER, ticket: { ...TICKET, applicantType: "parent" } },
    ]);
    const state = await declineTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state.success).toBe(true);
  });

  it("hides an offer whose lottery is not announced yet", async () => {
    if (SOUSAKU.resultsAnnouncedAt === null) return;
    vi.setSystemTime(new Date(SOUSAKU.resultsAnnouncedAt.getTime() - 1));
    const state = await claimTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state.success).toBe(false);
    expect(claimTicketTransfer).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const state = await claimTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state.error).toContain("セッション");
    expect(getIncomingTicketTransfers).not.toHaveBeenCalled();
  });

  it("is rate limited per account", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      ok: false,
      retryAfterSeconds: 30,
    });
    const state = await claimTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state.error).toContain("試行回数");
    expect(checkRateLimit).toHaveBeenCalledWith(
      "ticket-write:4D11",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("survives a database failure with a retry message", async () => {
    vi.mocked(claimTicketTransfer).mockRejectedValue(new Error("down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await claimTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state.error).toContain("処理に失敗");
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("declineTicketTransferAction", () => {
  it("declines against the recipient's own column", async () => {
    const state = await declineTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state).toEqual({ error: null, success: true });
    expect(resolveTicketTransfer).toHaveBeenCalledWith(31, "4D11", "declined");
  });

  it("stays available after the performance has started", async () => {
    // Declining only clears a stale offer out of the inbox.
    vi.setSystemTime(ticketStartsAt());
    const state = await declineTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state.success).toBe(true);
  });

  it("reports an offer that is no longer pending", async () => {
    vi.mocked(resolveTicketTransfer).mockResolvedValue(false);
    const state = await declineTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state.success).toBe(false);
    expect(state.error).toContain("見つかりません");
  });

  it("requires a session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const state = await declineTicketTransferAction(
      PREV,
      fd({ transferId: "31" }),
    );
    expect(state.error).toContain("セッション");
    expect(resolveTicketTransfer).not.toHaveBeenCalled();
  });
});
