/**
 * Parsing untrusted text into a database row id.
 *
 * Every id this app addresses rows by is a Postgres `serial` — a signed
 * 32-bit integer starting at 1 — so a value outside that range can never name
 * a row. Letting one through is not merely useless: the driver hands it to
 * Postgres, which rejects the parameter with "value out of range for type
 * integer", and a 404 turns into a 500.
 *
 * No server-only import: this is pure text handling, safe to use from a page,
 * a Server Action, or a test.
 */

/** Largest value a Postgres `serial` (int4) column can hold. */
export const MAX_ROW_ID = 2147483647;

/**
 * A row id parsed out of `value`, or null when it cannot be one.
 *
 * Accepts plain decimal digits only. `Number()` alone would also take "1e3",
 * " 12 ", "0x10", "+7" and "" — which would let one row answer to several
 * different URLs, and would turn a missing form field (`""` → `0`) into a
 * lookup for id 0. Rejecting them here keeps a bad id indistinguishable from a
 * missing row, so callers can answer both with the same 404.
 */
export function parseRowId(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  // `serial` starts at 1, so 0 is never a real row; above MAX_ROW_ID the
  // query itself would fail rather than simply find nothing.
  if (!Number.isInteger(id) || id < 1 || id > MAX_ROW_ID) return null;
  return id;
}
