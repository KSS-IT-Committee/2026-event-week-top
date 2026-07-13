import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteLotteryEntries } from "@/db/deleteLotteryEntries";
import { lotteryEntries } from "@/db/schema";
import { db } from "@/lib/db";

// `eq`/`and` are mocked so we can assert which columns/values the WHERE
// clause uses without depending on drizzle's internal SQL representation.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ __eq: true, col, val })),
    and: vi.fn((...conditions: unknown[]) => ({ __and: true, conditions })),
  };
});

const { whereSpy, deleteSpy } = vi.hoisted(() => {
  const whereSpy = vi.fn(async () => undefined);
  const deleteSpy = vi.fn(() => ({ where: whereSpy }));
  return { whereSpy, deleteSpy };
});

vi.mock("@/lib/db", () => ({
  db: { delete: deleteSpy },
}));

function makeExecutor() {
  const where = vi.fn(async () => undefined);
  const del = vi.fn(() => ({ where }));
  return { executor: { delete: del }, del, where };
}

const expectedCondition = {
  __and: true,
  conditions: [
    { __eq: true, col: lotteryEntries.username, val: "3A05" },
    { __eq: true, col: lotteryEntries.lotteryId, val: "kaitaku-performance" },
    { __eq: true, col: lotteryEntries.applicantType, val: "parent" },
  ],
};

describe("deleteLotteryEntries", () => {
  beforeEach(() => {
    deleteSpy.mockReturnValue({ where: whereSpy });
  });

  it("deletes the account's entries for one lottery + applicant type", async () => {
    await deleteLotteryEntries("3A05", "kaitaku-performance", "parent");

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith(lotteryEntries);
    expect(vi.mocked(and)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(eq)).toHaveBeenCalledTimes(3);
    expect(whereSpy).toHaveBeenCalledWith(expectedCondition);
  });

  it("scopes the delete to the given applicant type", async () => {
    await deleteLotteryEntries("1A01", "sousaku-performance", "student");

    expect(vi.mocked(eq)).toHaveBeenCalledWith(
      lotteryEntries.applicantType,
      "student",
    );
    expect(vi.mocked(eq)).toHaveBeenCalledWith(
      lotteryEntries.lotteryId,
      "sousaku-performance",
    );
  });

  it("awaits the where() promise (resolves to undefined)", async () => {
    await expect(
      deleteLotteryEntries("3A05", "kaitaku-performance", "parent"),
    ).resolves.toBeUndefined();
  });

  it("propagates a rejection from the default executor's where()", async () => {
    const boom = new Error("delete failed");
    whereSpy.mockRejectedValueOnce(boom);

    await expect(
      deleteLotteryEntries("3A05", "kaitaku-performance", "parent"),
    ).rejects.toBe(boom);
  });

  it("uses a custom executor (tx handle) and never touches db.delete", async () => {
    const { executor, del, where } = makeExecutor();

    await deleteLotteryEntries(
      "3A05",
      "kaitaku-performance",
      "parent",
      executor as never,
    );

    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(lotteryEntries);
    expect(where).toHaveBeenCalledWith(expectedCondition);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("propagates a rejection from a custom executor's where()", async () => {
    const { executor, where } = makeExecutor();
    const boom = new Error("tx delete failed");
    where.mockRejectedValueOnce(boom);

    await expect(
      deleteLotteryEntries(
        "3A05",
        "kaitaku-performance",
        "parent",
        executor as never,
      ),
    ).rejects.toBe(boom);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
