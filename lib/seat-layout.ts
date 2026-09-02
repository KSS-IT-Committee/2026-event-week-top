/**
 * The 芸能祭 hall's seat grid. `SEAT_COUNT_BY_ROW[row]` is how many seats row
 * `row` holds, rows running A (index 0) upward.
 *
 * Both the registration form and the server action that validates its
 * submission import this, so the dropdown and the validation cannot drift
 * apart — never inline a second copy. Deliberately free of `server-only`: the
 * client form needs it too.
 */
export const SEAT_COUNT_BY_ROW = [
  12, 16, 26, 26, 26, 32, 32, 32, 26, 26, 26, 26, 34, 34, 34, 34, 34, 34, 34,
  34, 34, 34, 34,
] as const;

/** How many rows the hall has (A through W). */
export const ROW_COUNT = SEAT_COUNT_BY_ROW.length;

/** The letter naming a zero-based row index: 0 -> "A". */
export function rowLabel(row: number): string {
  return String.fromCharCode(65 + row);
}

/** Whether `row` names a row of the hall. Zero-based. */
export function isRowInLayout(row: number): boolean {
  return Number.isInteger(row) && row >= 0 && row < ROW_COUNT;
}

/**
 * Whether seat `seat` exists in row `row`. `row` is zero-based, `seat` is the
 * one-based number printed on the seat.
 */
export function isSeatInLayout(row: number, seat: number): boolean {
  if (!isRowInLayout(row)) return false;
  return Number.isInteger(seat) && seat >= 1 && seat <= SEAT_COUNT_BY_ROW[row];
}

/** The label a seat is stored under: row 0, seat 12 -> "A-12". */
export function seatLabel(row: number, seat: number): string {
  return `${rowLabel(row)}-${seat}`;
}
