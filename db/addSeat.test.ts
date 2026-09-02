import { beforeEach, describe, expect, it, vi } from "vitest";

import { addSeat } from "@/db/addSeat";
import { Seats } from "@/db/schema";

const { insertSpy, valuesSpy, onConflictDoUpdateSpy } = vi.hoisted(() => {
  const onConflictDoUpdateSpy = vi.fn(async () => []);
  const valuesSpy = vi.fn(() => ({
    onConflictDoUpdate: onConflictDoUpdateSpy,
  }));
  const insertSpy = vi.fn(() => ({ values: valuesSpy }));

  return { insertSpy, valuesSpy, onConflictDoUpdateSpy };
});

vi.mock("@/lib/db", () => ({
  db: { insert: insertSpy },
}));

describe("addSeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts the seat on (username, performance)", async () => {
    await addSeat("3A05", "A", "A-12");

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith(Seats);
    expect(valuesSpy).toHaveBeenCalledTimes(1);
    expect(valuesSpy).toHaveBeenCalledWith({
      username: "3A05",
      performance: "A",
      seat: "A-12",
    });
    expect(onConflictDoUpdateSpy).toHaveBeenCalledTimes(1);
    expect(onConflictDoUpdateSpy).toHaveBeenCalledWith({
      target: [Seats.username, Seats.performance],
      set: { seat: "A-12" },
    });
  });

  it("propagates a rejection from the query", async () => {
    const error = new Error("insert failed");
    onConflictDoUpdateSpy.mockRejectedValueOnce(error);

    await expect(addSeat("3A05", "B", "B-03")).rejects.toBe(error);
  });
});
