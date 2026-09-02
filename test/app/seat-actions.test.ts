import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  type SeatRegistrationState,
  submitSeatAction,
} from "@/app/seat/edit/actions";
import { addSeat } from "@/db/addSeat";
import { SEAT_COUNT_BY_ROW } from "@/lib/seat-layout";
import { getCurrentUser } from "@/lib/session";

// ── Module mocks ──────────────────────────────────────────────────────────
// lib/seat-layout stays real: the action must validate against the hall's
// actual grid, which is the thing these tests are pinning down.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/addSeat", () => ({ addSeat: vi.fn(async () => {}) }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

const prev: SeatRegistrationState = { error: null, success: false };

// Build a FormData from a plain object.
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

/** A well-formed submission; spread with overrides to break one field. */
const validForm = {
  class: "3A",
  number: "5",
  performance: "A",
  column: "0",
  seat: "12",
};

function asUser(username: string, roles: readonly string[]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    username,
    roles: [...roles],
  });
}

/** A rejection shaped like the one postgres-js throws. */
function pgError(code: string, constraintName?: string) {
  return Object.assign(new Error("db rejected the query"), {
    code,
    ...(constraintName === undefined
      ? {}
      : { constraint_name: constraintName }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  vi.mocked(addSeat).mockResolvedValue(undefined);
});

describe("submitSeatAction authorization", () => {
  it("rejects when there is no session, without writing", async () => {
    const state = await submitSeatAction(prev, fd(validForm));

    expect(state).toEqual({
      error: "座席を登録する権限がありません。",
      success: false,
    });
    expect(addSeat).not.toHaveBeenCalled();
  });

  it("rejects a logged-in student who holds neither committee role", async () => {
    asUser("3A05", ["G3", "ClassA", "Students"]);

    const state = await submitSeatAction(prev, fd(validForm));

    expect(state.success).toBe(false);
    expect(addSeat).not.toHaveBeenCalled();
  });

  it("rejects a teacher without a committee role", async () => {
    asUser("kabcdefg", ["Teachers"]);

    const state = await submitSeatAction(prev, fd(validForm));

    expect(state.success).toBe(false);
    expect(addSeat).not.toHaveBeenCalled();
  });

  it.each([["Geinousai"], ["IT"]])("admits a %s member", async (role) => {
    asUser("4B12", ["G4", "ClassB", "Students", role]);

    const state = await submitSeatAction(prev, fd(validForm));

    expect(state).toEqual({ error: null, success: true });
    expect(addSeat).toHaveBeenCalledTimes(1);
  });
});

describe("submitSeatAction validation", () => {
  beforeEach(() => {
    asUser("4B12", ["Geinousai"]);
  });

  it.each([
    ["an unknown class", { class: "7A" }],
    ["a blank class", { class: "" }],
    ["attendance number 0", { number: "0" }],
    ["attendance number 41", { number: "41" }],
    ["a non-numeric attendance number", { number: "五" }],
    ["a negative attendance number", { number: "-3" }],
    ["an unknown performance", { performance: "F" }],
    ["a blank performance", { performance: "" }],
    ["a column past the last row", { column: "23" }],
    ["a negative column", { column: "-1" }],
    ["seat number 0", { seat: "0" }],
  ])("rejects %s without writing", async (_label, override) => {
    const state = await submitSeatAction(
      prev,
      fd({ ...validForm, ...override }),
    );

    expect(state.success).toBe(false);
    expect(state.error).not.toBeNull();
    expect(addSeat).not.toHaveBeenCalled();
  });

  it("rejects a seat number past the end of its own row", async () => {
    // Row A (column 0) holds 12 seats; row W (column 22) holds 34. Seat 13
    // exists in one and not the other, so the check must be per-row.
    expect(SEAT_COUNT_BY_ROW[0]).toBe(12);

    const tooFar = await submitSeatAction(
      prev,
      fd({ ...validForm, column: "0", seat: "13" }),
    );
    expect(tooFar).toEqual({
      error: "選択した列に存在しない座席番号です。",
      success: false,
    });
    expect(addSeat).not.toHaveBeenCalled();

    const inRange = await submitSeatAction(
      prev,
      fd({ ...validForm, column: "22", seat: "13" }),
    );
    expect(inRange.success).toBe(true);
  });

  it("accepts the last seat of a row", async () => {
    const state = await submitSeatAction(
      prev,
      fd({ ...validForm, column: "0", seat: String(SEAT_COUNT_BY_ROW[0]) }),
    );

    expect(state.success).toBe(true);
  });
});

describe("submitSeatAction stored values", () => {
  beforeEach(() => {
    asUser("4B12", ["Geinousai"]);
  });

  it("zero-pads the attendance number into the username", async () => {
    await submitSeatAction(
      prev,
      fd({ ...validForm, class: "3A", number: "5" }),
    );

    expect(addSeat).toHaveBeenCalledWith("3A05", "A", expect.any(String));
  });

  it("leaves a two-digit attendance number alone", async () => {
    await submitSeatAction(
      prev,
      fd({ ...validForm, class: "6D", number: "40" }),
    );

    expect(addSeat).toHaveBeenCalledWith("6D40", "A", expect.any(String));
  });

  it("labels the seat as <row letter>-<number>", async () => {
    await submitSeatAction(prev, fd({ ...validForm, column: "0", seat: "12" }));
    expect(addSeat).toHaveBeenLastCalledWith("3A05", "A", "A-12");

    await submitSeatAction(
      prev,
      fd({ ...validForm, column: "22", seat: "34" }),
    );
    expect(addSeat).toHaveBeenLastCalledWith("3A05", "A", "W-34");
  });

  it("normalizes full-width input before validating it", async () => {
    // The committee types on a Japanese IME; full-width digits and letters
    // must not read as a different class or a broken number.
    await submitSeatAction(
      prev,
      fd({ ...validForm, class: "３Ａ", number: "０５", seat: "１２" }),
    );

    expect(addSeat).toHaveBeenCalledWith("3A05", "A", "A-12");
  });

  it("revalidates both seat pages after a successful write", async () => {
    await submitSeatAction(prev, fd(validForm));

    expect(revalidatePath).toHaveBeenCalledWith("/seat");
    expect(revalidatePath).toHaveBeenCalledWith("/seat/edit");
  });
});

describe("submitSeatAction failures", () => {
  beforeEach(() => {
    asUser("4B12", ["Geinousai"]);
  });

  it("names the collision when the seat belongs to another student", async () => {
    vi.mocked(addSeat).mockRejectedValueOnce(
      pgError("23505", "seats_performance_seat_unique"),
    );

    const state = await submitSeatAction(prev, fd(validForm));

    expect(state).toEqual({
      error: "その座席はすでに別の生徒に登録されています。",
      success: false,
    });
  });

  it("names the missing student when the foreign key rejects the row", async () => {
    vi.mocked(addSeat).mockRejectedValueOnce(pgError("23503"));

    const state = await submitSeatAction(prev, fd(validForm));

    expect(state).toEqual({
      error: "そのクラス・出席番号の生徒は存在しません。",
      success: false,
    });
  });

  it("falls back to a generic message for anything else", async () => {
    vi.mocked(addSeat).mockRejectedValueOnce(new Error("connection reset"));

    const state = await submitSeatAction(prev, fd(validForm));

    expect(state).toEqual({
      error: "座席の登録に失敗しました。",
      success: false,
    });
  });

  it("does not revalidate when the write failed", async () => {
    vi.mocked(addSeat).mockRejectedValueOnce(new Error("connection reset"));

    await submitSeatAction(prev, fd(validForm));

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
