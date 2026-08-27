import { beforeEach, describe, expect, it, vi } from "vitest";

import { addSeat } from "@/db/addSeat";
import { Seats } from "@/db/schema";

const { insertSpy, valuesSpy, returningSpy } = vi.hoisted(() => {
  const returningSpy = vi.fn(async () => []);
  const valuesSpy = vi.fn(() => ({ returning: returningSpy }));
  const insertSpy = vi.fn(() => ({ values: valuesSpy }));

  return { insertSpy, valuesSpy, returningSpy };
});

vi.mock("@/lib/db", () => ({
  db: { insert: insertSpy },
}));

describe("addSeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts the seat and requests the inserted row", async () => {
    await addSeat("3A05", "A", "A-12");

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith(Seats);
    expect(valuesSpy).toHaveBeenCalledTimes(1);
    expect(valuesSpy).toHaveBeenCalledWith({
      username: "3A05",
      performance: "A",
      seat: "A-12",
    });
    expect(returningSpy).toHaveBeenCalledTimes(1);
  });

  it("propagates a rejection from returning()", async () => {
    const error = new Error("insert failed");
    returningSpy.mockRejectedValueOnce(error);

    await expect(addSeat("3A05", "B", "B-03")).rejects.toBe(error);
  });
});
