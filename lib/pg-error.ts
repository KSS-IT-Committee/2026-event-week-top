/**
 * Narrow reads of the SQLSTATE fields postgres-js puts on a rejected query.
 * Structural rather than `instanceof PostgresError` so callers stay decoupled
 * from the driver and can be tested with plain objects.
 */

/** unique_violation — a UNIQUE constraint (or index) rejected the row. */
const UNIQUE_VIOLATION = "23505";
/** foreign_key_violation — a referenced row does not exist. */
const FOREIGN_KEY_VIOLATION = "23503";

// How deep to follow `cause` before giving up. Drizzle adds one link today;
// the bound keeps a self-referential chain from looping.
const MAX_CAUSE_DEPTH = 5;

type DriverError = { code: string; constraint_name?: unknown };

/**
 * The driver error carrying the SQLSTATE, which is not always the error that
 * was thrown: Drizzle wraps a failed query in a DrizzleQueryError ("Failed
 * query: …") and hangs the original postgres-js error off `cause`. Reading
 * only the top level therefore misses every constraint violation — which is
 * why the SQLSTATE and the constraint name are read off the SAME object here,
 * never mixed across links of the chain.
 */
function driverErrorOf(error: unknown): DriverError | null {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== "object" || current === null) return null;
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") return candidate as DriverError;
    current = candidate.cause;
  }
  return null;
}

function sqlStateOf(error: unknown): string | null {
  return driverErrorOf(error)?.code ?? null;
}

function constraintOf(error: unknown): string | null {
  const constraintName = driverErrorOf(error)?.constraint_name;
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
