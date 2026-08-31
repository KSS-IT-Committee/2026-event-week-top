"use server";

import { revalidatePath } from "next/cache";

import { addSeat, Performance } from "@/db/addSeat";
import { isClassName, performanceEnum } from "@/db/schema";
import { hasAnyRole } from "@/lib/access";
import { getCurrentUser } from "@/lib/session";

export type SeatRegistrationState = {
  error: string | null;
  success: boolean;
};

const SEAT_COUNT_BY_ROW = [
  12, 16, 26, 26, 26, 32, 32, 32, 26, 26, 26, 26, 34, 34, 34, 34, 34, 34, 34,
  34, 34, 34, 34,
] as const;

function normalizeInput(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

function parseInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function submitSeatAction(
  _previousState: SeatRegistrationState,
  formData: FormData,
): Promise<SeatRegistrationState> {
  const operator = await getCurrentUser();
  if (operator === null || !hasAnyRole(operator, ["Geinousai", "IT"])) {
    return { error: "座席を登録する権限がありません。", success: false };
  }

  const className = normalizeInput(formData.get("class"));
  const attendanceNumber = parseInteger(normalizeInput(formData.get("number")));
  const performance = normalizeInput(formData.get("performance"));
  const column = parseInteger(normalizeInput(formData.get("column")));
  const seatNumber = parseInteger(normalizeInput(formData.get("seat")));

  if (!isClassName(className)) {
    return { error: "クラスを選択してください。", success: false };
  }
  if (
    attendanceNumber === null ||
    attendanceNumber < 1 ||
    attendanceNumber > 40
  ) {
    return {
      error: "出席番号は1から40の範囲で入力してください。",
      success: false,
    };
  }
  if (
    !performanceEnum.enumValues.includes(
      performance as "A" | "B" | "C" | "D" | "E",
    )
  ) {
    return { error: "公演を選択してください。", success: false };
  }
  if (column === null || column < 0 || column >= SEAT_COUNT_BY_ROW.length) {
    return { error: "座席の列を選択してください。", success: false };
  }
  if (
    seatNumber === null ||
    seatNumber < 1 ||
    seatNumber > SEAT_COUNT_BY_ROW[column]
  ) {
    return { error: "選択した列に存在しない座席番号です。", success: false };
  }

  const seat = `${String.fromCharCode(65 + column)}-${seatNumber}`;
  const username = `${className}${String(attendanceNumber).padStart(2, "0")}`;
  console.log(username, performance, seat);
  try {
    await addSeat(username, performance as Performance, seat);
  } catch {
    return { error: "座席の登録に失敗しました。", success: false };
  }

  revalidatePath("/seat");
  revalidatePath("/seat/edit");
  return { error: null, success: true };
}
