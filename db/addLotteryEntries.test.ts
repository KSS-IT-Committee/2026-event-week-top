import { beforeEach, describe, expect, it, vi } from "vitest";

import { addLotteryEntries } from "@/db/addLotteryEntries";
import { lotteryEntries, type NewLotteryEntry } from "@/db/schema";
import { db } from "@/lib/db";

const { valuesSpy, insertSpy } = vi.hoisted(() => {
  const valuesSpy = vi.fn(async () => undefined);
  const insertSpy = vi.fn(() => ({ values: valuesSpy }));
  return { valuesSpy, insertSpy };
});

vi.mock("@/lib/db", () => ({
  db: { insert: insertSpy },
}));

function makeExecutor() {
  const values = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values }));
  return { executor: { insert }, insert, values };
}

function makeEntry(overrides: Partial<NewLotteryEntry> = {}): NewLotteryEntry {
  return {
    lotteryId: "kaitaku-performance",
    slotId: "slot-1",
    username: "3A05",
    applicantType: "parent",
    firstChoice: "3A",
    secondChoice: null,
    thirdChoice: null,
    ...overrides,
  };
}

describe("addLotteryEntries", () => {
  beforeEach(() => {
    insertSpy.mockReturnValue({ values: valuesSpy });
  });

  it("inserts the given rows: db.insert(lotteryEntries).values(rows)", async () => {
    const entries = [makeEntry(), makeEntry({ slotId: "slot-2" })];

    await addLotteryEntries(entries);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith(lotteryEntries);
    expect(valuesSpy).toHaveBeenCalledTimes(1);
    expect(valuesSpy).toHaveBeenCalledWith(entries);
  });

  it("does not touch the db for an empty entries array", async () => {
    await expect(addLotteryEntries([])).resolves.toBeUndefined();

    expect(insertSpy).not.toHaveBeenCalled();
    expect(valuesSpy).not.toHaveBeenCalled();
  });

  it("uses a custom executor (tx handle) and never touches db.insert", async () => {
    const { executor, insert, values } = makeExecutor();
    const entries = [makeEntry()];

    await addLotteryEntries(entries, executor as never);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(lotteryEntries);
    expect(values).toHaveBeenCalledWith(entries);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("propagates a rejection from values()", async () => {
    const boom = new Error("insert failed");
    valuesSpy.mockRejectedValueOnce(boom);

    await expect(addLotteryEntries([makeEntry()])).rejects.toBe(boom);
  });
});
