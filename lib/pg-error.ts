/**
 * Narrow reads of the SQLSTATE fields postgres-js puts on a rejected query.
 * Structural rather than `instanceof PostgresError` so callers stay decoupled
 * from the driver and can be tested with plain objects.
 */

/** unique_violation — a UNIQUE constraint (or index) rejected the row. */
const UNIQUE_VIOLATION = "23505";
/** foreign_key_violation — a referenced row does not exist. */
const FOREIGN_KEY_VIOLATION = "23503";

function sqlStateOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : null;
}

function constraintOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { constraint_name: constraintName } = error as {
    constraint_name?: unknown;
  };
  return typeof constraintName === "string" ? constraintName : null;
}

/**
 * Whether `error` is a unique-constraint violation. Pass `constraint` to match
 * one named constraint — a table with several UNIQUE constraints otherwise
 * reports them all through the same SQLSTATE.
 */
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  if (sqlStateOf(error) !== UNIQUE_VIOLATION) return false;
  return constraint === undefined || constraintOf(error) === constraint;
}

/** Whether `error` is a foreign-key violation (the referenced row is absent). */
export function isForeignKeyViolation(error: unknown): boolean {
  return sqlStateOf(error) === FOREIGN_KEY_VIOLATION;
}
