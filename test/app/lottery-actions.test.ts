import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type LotteryEntryFormState,
  submitLotteryEntriesAction,
} from "@/app/lottery/[lotteryId]/actions";
import { addLotteryEntries } from "@/db/addLotteryEntries";
import { deleteLotteryEntries } from "@/db/deleteLotteryEntries";
import { ensurePreviewUser } from "@/db/ensurePreviewUser";
import { db } from "@/lib/db";
import { getLottery, type Lottery } from "@/lib/lotteries";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";

// ── Module mocks ──────────────────────────────────────────────────────────
// lib/lotteries stays real: the action must validate against the actual
// lottery definitions (slots, acts, eligibility).
vi.mock("@/db/addLotteryEntries", () => ({
  addLotteryEntries: vi.fn(async () => {}),
}));
vi.mock("@/db/deleteLotteryEntries", () => ({
  deleteLotteryEntries: vi.fn(async () => {}),
}));
vi.mock("@/db/ensurePreviewUser", () => ({
  ensurePreviewUser: vi.fn(async () => {}),
}));
vi.mock("@/lib/db", () => ({
  db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true, retryAfterSeconds: 0 })),
}));
vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

const prev: LotteryEntryFormState = {
  error: null,
  success: false,
  savedSlotCount: 0,
};

// Build a FormData from a plain object.
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

function asUser(username: string) {
  vi.mocked(getCurrentUser).mockResolvedValue({ username, roles: [] });
}

function mustGetLottery(lotteryId: string): Lottery {
  const lottery = getLottery(lotteryId);
  if (lottery === null) throw new Error(`missing lottery: ${lotteryId}`);
  return lottery;
}

// A moment when the lottery accepts submissions, derived from its OWN
// configured window — the opensAt/closesAt dates are operational config that
// changes as the event approaches, and editing them must never break this
// suite (the action checks availability against the clock).
function openInstant(lottery: Lottery): Date {
  if (lottery.closesAt !== null) {
    return new Date(lottery.closesAt.getTime() - 60_000);
  }
  if (lottery.opensAt !== null) {
    return new Date(lottery.opensAt.getTime() + 60_000);
  }
  return new Date("2026-07-20T12:00:00+09:00");
}

function atOpenTime(lotteryId: string) {
  vi.setSystemTime(openInstant(mustGetLottery(lotteryId)));
}

function expectNoWrites() {
  expect(db.transaction).not.toHaveBeenCalled();
  expect(deleteLotteryEntries).not.toHaveBeenCalled();
  expect(addLotteryEntries).not.toHaveBeenCalled();
}

beforeEach(() => {
  // Default clock: inside kaitaku's window (most tests submit to kaitaku).
  // Tests that submit to sousaku call atOpenTime("sousaku-performance").
  vi.useFakeTimers({
    now: openInstant(mustGetLottery("kaitaku-performance")),
  });
  // clearMocks wipes call history AND implementations, so re-apply the
  // default mock implementations every test.
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  vi.mocked(checkRateLimit).mockReturnValue({ ok: true, retryAfterSeconds: 0 });
  vi.mocked(addLotteryEntries).mockResolvedValue(undefined);
  vi.mocked(deleteLotteryEntries).mockResolvedValue(undefined);
  vi.mocked(ensurePreviewUser).mockResolvedValue(undefined);
  vi.mocked(db.transaction).mockImplementation(((
    cb: (tx: unknown) => unknown,
  ) => Promise.resolve(cb({}))) as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("submitLotteryEntriesAction", () => {
  it("rejects when there is no session, without touching the db", async () => {
    const state = await submitLotteryEntriesAction(
      prev,
      fd({ lotteryId: "kaitaku-performance", applicantType: "parent" }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("セッション");
    expectNoWrites();
  });

  it("rejects an unknown lottery id", async () => {
    asUser("3A05");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({ lotteryId: "nose-flute-performance", applicantType: "parent" }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("見つかりません");
    expectNoWrites();
  });

  it("rejects when the lottery id is missing entirely", async () => {
    asUser("3A05");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({ applicantType: "parent" }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("見つかりません");
    expectNoWrites();
  });

  it("rejects an applicant type that is not a known type", async () => {
    asUser("3A05");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({ lotteryId: "kaitaku-performance", applicantType: "teacher" }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("区分");
    expectNoWrites();
  });

  it("rejects an applicant type the lottery does not offer (kaitaku student)", async () => {
    asUser("3A05");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({ lotteryId: "kaitaku-performance", applicantType: "student" }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("申し込めません");
    expectNoWrites();
  });

  it("rejects an account outside the lottery's classes (5A on kaitaku)", async () => {
    asUser("5A01");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({ lotteryId: "kaitaku-performance", applicantType: "parent" }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("申し込めません");
    expectNoWrites();
  });

  it("rejects a staff account applying as a parent, without writing", async () => {
    asUser("k0959176");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({ lotteryId: "sousaku-performance", applicantType: "parent" }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("申し込めません");
    expectNoWrites();
  });

  it("rejects a staff account on the kaitaku lottery, without writing", async () => {
    asUser("k0959176");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({ lotteryId: "kaitaku-performance", applicantType: "parent" }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("申し込めません");
    expectNoWrites();
  });

  it("lets a staff account submit as 本人 on the sousaku lottery", async () => {
    asUser("k0959176");
    atOpenTime("sousaku-performance");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "sousaku-performance",
        applicantType: "student",
        "choice-sep13-slot-1-1": "6A",
      }),
    );

    expect(state).toEqual({ error: null, success: true, savedSlotCount: 1 });
    expect(addLotteryEntries).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          username: "k0959176",
          applicantType: "student",
          slotId: "sep13-slot-1",
          firstChoice: "6A",
          partySize: 1,
        }),
      ],
      {},
    );
  });

  it("rejects alias accounts (suffixed usernames), without writing", async () => {
    asUser("3A05_sakuten");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({ lotteryId: "kaitaku-performance", applicantType: "parent" }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("申し込めません");
    expectNoWrites();
  });

  it("throttles per username and reports the retry message", async () => {
    asUser("3A05");
    vi.mocked(checkRateLimit).mockReturnValue({
      ok: false,
      retryAfterSeconds: 30,
    });

    const state = await submitLotteryEntriesAction(
      prev,
      fd({ lotteryId: "kaitaku-performance", applicantType: "parent" }),
    );

    expect(vi.mocked(checkRateLimit)).toHaveBeenCalledWith(
      "lottery:3A05",
      expect.any(Number),
      expect.any(Number),
    );
    expect(state.success).toBe(false);
    expect(state.error).toContain("試行回数");
    expectNoWrites();
  });

  it("accepts up to the deadline's last instant and rejects from the bound", async () => {
    asUser("3A05");
    const { closesAt } = mustGetLottery("kaitaku-performance");
    expect(closesAt).not.toBeNull();
    if (closesAt === null) return;

    vi.setSystemTime(new Date(closesAt.getTime() - 1));
    const lastInstant = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "kaitaku-performance",
        applicantType: "parent",
        "choice-sep12-1": "performance-1",
        "party-sep12": "1",
      }),
    );
    expect(lastInstant.success).toBe(true);

    vi.setSystemTime(closesAt);
    const afterClose = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "kaitaku-performance",
        applicantType: "parent",
        "choice-sep12-1": "performance-1",
        "party-sep12": "1",
      }),
    );
    expect(afterClose.success).toBe(false);
    expect(afterClose.error).toContain("期間外");
  });

  it("rejects a repeated act within one slot, without writing", async () => {
    asUser("3A05");
    atOpenTime("sousaku-performance");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "sousaku-performance",
        applicantType: "parent",
        "choice-sep12-slot-1-1": "5A",
        "choice-sep12-slot-1-2": "5A",
      }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("第一公演");
    expectNoWrites();
  });

  it("rejects a choice the lottery does not offer, without writing", async () => {
    asUser("3A05");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "kaitaku-performance",
        applicantType: "parent",
        "choice-sep12-1": "3A",
      }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("不正な選択肢");
    expectNoWrites();
  });

  it("replaces the saved entries atomically on a valid submission", async () => {
    asUser("3A05");
    atOpenTime("sousaku-performance");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "sousaku-performance",
        applicantType: "parent",
        "choice-sep12-slot-1-1": "5A",
        "choice-sep12-slot-1-2": "5B",
        "party-sep12-slot-1": "2",
        "choice-sep13-slot-3-1": "6D",
        "party-sep13-slot-3": "1",
      }),
    );

    expect(state).toEqual({ error: null, success: true, savedSlotCount: 2 });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(deleteLotteryEntries).toHaveBeenCalledTimes(1);
    expect(deleteLotteryEntries).toHaveBeenCalledWith(
      "3A05",
      "sousaku-performance",
      "parent",
      {},
    );
    expect(addLotteryEntries).toHaveBeenCalledTimes(1);
    expect(addLotteryEntries).toHaveBeenCalledWith(
      [
        {
          lotteryId: "sousaku-performance",
          slotId: "sep12-slot-1",
          username: "3A05",
          applicantType: "parent",
          firstChoice: "5A",
          secondChoice: "5B",
          thirdChoice: null,
          partySize: 2,
        },
        {
          lotteryId: "sousaku-performance",
          slotId: "sep13-slot-3",
          username: "3A05",
          applicantType: "parent",
          firstChoice: "6D",
          secondChoice: null,
          thirdChoice: null,
          partySize: 1,
        },
      ],
      {},
    );
    // Inside the one transaction: the preview user stub (a users-FK
    // prerequisite on PR previews) first, then delete, then insert.
    expect(ensurePreviewUser).toHaveBeenCalledWith("3A05", {});
    expect(
      vi.mocked(ensurePreviewUser).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(deleteLotteryEntries).mock.invocationCallOrder[0]);
    expect(
      vi.mocked(deleteLotteryEntries).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(addLotteryEntries).mock.invocationCallOrder[0]);
  });

  it("compacts rank gaps before saving (1st blank, 2nd + 3rd filled)", async () => {
    asUser("3A05");
    atOpenTime("sousaku-performance");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "sousaku-performance",
        applicantType: "parent",
        "choice-sep12-slot-2-2": "5C",
        "choice-sep12-slot-2-3": "6A",
        "party-sep12-slot-2": "1",
      }),
    );

    expect(state.success).toBe(true);
    expect(addLotteryEntries).toHaveBeenCalledWith(
      [
        {
          lotteryId: "sousaku-performance",
          slotId: "sep12-slot-2",
          username: "3A05",
          applicantType: "parent",
          firstChoice: "5C",
          secondChoice: "6A",
          thirdChoice: null,
          partySize: 1,
        },
      ],
      {},
    );
  });

  it("saves a kaitaku parent's per-day ranked-performance entries", async () => {
    asUser("3A05");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "kaitaku-performance",
        applicantType: "parent",
        "choice-sep12-1": "performance-3",
        "choice-sep12-2": "performance-6",
        "party-sep12": "2",
        "choice-sep13-1": "performance-1",
        "party-sep13": "1",
      }),
    );

    expect(state).toEqual({ error: null, success: true, savedSlotCount: 2 });
    expect(addLotteryEntries).toHaveBeenCalledWith(
      [
        {
          lotteryId: "kaitaku-performance",
          slotId: "sep12",
          username: "3A05",
          applicantType: "parent",
          firstChoice: "performance-3",
          secondChoice: "performance-6",
          thirdChoice: null,
          partySize: 2,
        },
        {
          lotteryId: "kaitaku-performance",
          slotId: "sep13",
          username: "3A05",
          applicantType: "parent",
          firstChoice: "performance-1",
          secondChoice: null,
          thirdChoice: null,
          partySize: 1,
        },
      ],
      {},
    );
  });

  it("rejects a parent entry whose 観覧人数 is missing, without writing", async () => {
    asUser("3A05");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "kaitaku-performance",
        applicantType: "parent",
        "choice-sep12-1": "performance-1",
      }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("観覧人数");
    expectNoWrites();
  });

  it("trims whitespace around submitted choice and 人数 values", async () => {
    asUser("3A05");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "kaitaku-performance",
        applicantType: "parent",
        "choice-sep12-1": " performance-1 ",
        "party-sep12": " 2 ",
      }),
    );

    expect(state.success).toBe(true);
    expect(addLotteryEntries).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          slotId: "sep12",
          firstChoice: "performance-1",
          partySize: 2,
        }),
      ],
      {},
    );
  });

  it("treats an all-blank submission as clearing the saved entries", async () => {
    asUser("3A05");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({ lotteryId: "kaitaku-performance", applicantType: "parent" }),
    );

    expect(state).toEqual({ error: null, success: true, savedSlotCount: 0 });
    expect(deleteLotteryEntries).toHaveBeenCalledTimes(1);
    expect(addLotteryEntries).toHaveBeenCalledWith([], {});
  });

  it("lets a student and a parent submit separately on the sousaku lottery", async () => {
    asUser("1A01");
    atOpenTime("sousaku-performance");
    const state = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "sousaku-performance",
        applicantType: "student",
        "choice-sep12-slot-2-1": "5A",
        // Crafted 人数 on a 本人 entry must be ignored — always 1.
        "party-sep12-slot-2": "2",
      }),
    );

    expect(state.success).toBe(true);
    expect(addLotteryEntries).toHaveBeenCalledWith(
      [
        {
          lotteryId: "sousaku-performance",
          slotId: "sep12-slot-2",
          username: "1A01",
          applicantType: "student",
          firstChoice: "5A",
          secondChoice: null,
          thirdChoice: null,
          partySize: 1,
        },
      ],
      {},
    );
  });

  it("returns a retryable error when the transaction fails", async () => {
    asUser("3A05");
    vi.mocked(db.transaction).mockRejectedValue(new Error("boom") as never);

    const state = await submitLotteryEntriesAction(
      prev,
      fd({
        lotteryId: "kaitaku-performance",
        applicantType: "parent",
        "choice-sep12-1": "performance-1",
        "party-sep12": "1",
      }),
    );

    expect(state.success).toBe(false);
    expect(state.error).toContain("保存に失敗しました");
  });
});
