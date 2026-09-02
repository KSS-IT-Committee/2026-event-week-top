import { describe, expect, it } from "vitest";

import {
  isRowInLayout,
  isSeatInLayout,
  ROW_COUNT,
  rowLabel,
  SEAT_COUNT_BY_ROW,
  seatLabel,
} from "@/lib/seat-layout";

describe("the layout itself", () => {
  it("runs A through W", () => {
    expect(ROW_COUNT).toBe(23);
    expect(rowLabel(0)).toBe("A");
    expect(rowLabel(ROW_COUNT - 1)).toBe("W");
  });

  it("gives every row at least one seat", () => {
    expect(SEAT_COUNT_BY_ROW.every((count) => count >= 1)).toBe(true);
  });
});

describe("isRowInLayout", () => {
  it("accepts every row of the hall", () => {
    expect(isRowInLayout(0)).toBe(true);
    expect(isRowInLayout(ROW_COUNT - 1)).toBe(true);
  });

  it("rejects rows outside it", () => {
    expect(isRowInLayout(-1)).toBe(false);
    expect(isRowInLayout(ROW_COUNT)).toBe(false);
    expect(isRowInLayout(1.5)).toBe(false);
    expect(isRowInLayout(Number.NaN)).toBe(false);
  });
});

describe("isSeatInLayout", () => {
  it("accepts the first and last seat of a row", () => {
    expect(isSeatInLayout(0, 1)).toBe(true);
    expect(isSeatInLayout(0, SEAT_COUNT_BY_ROW[0])).toBe(true);
  });

  it("rejects a seat past the end of its own row", () => {
    // Row A holds 12 seats; row W holds 34. A number valid in one row is not
    // automatically valid in another.
    expect(isSeatInLayout(0, 13)).toBe(false);
    expect(isSeatInLayout(22, 13)).toBe(true);
  });

  it("rejects seat 0, negatives, and non-integers", () => {
    expect(isSeatInLayout(0, 0)).toBe(false);
    expect(isSeatInLayout(0, -1)).toBe(false);
    expect(isSeatInLayout(0, 1.5)).toBe(false);
  });

  it("rejects any seat in a row that does not exist", () => {
    expect(isSeatInLayout(ROW_COUNT, 1)).toBe(false);
  });
});

describe("seatLabel", () => {
  it("joins the row letter and the seat number", () => {
    expect(seatLabel(0, 12)).toBe("A-12");
    expect(seatLabel(22, 34)).toBe("W-34");
  });
});
