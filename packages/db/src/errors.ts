/**
 * Database failures, classified.
 *
 * Two jobs:
 *  1. decide whether an operation is worth retrying — a deadlock or a dropped
 *     socket is transient, a unique violation never is
 *  2. turn a driver error into something a route handler can answer with,
 *     without ever leaking a constraint name or a connection string to a client
 */

/** Postgres SQLSTATEs that mean "try again", not "you were wrong". */
const RETRYABLE_PG = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "57P03", // cannot_connect_now — server still starting
  "08006", // connection_failure
  "08003", // connection_does_not_exist
  "08000", // connection_exception
  "53300", // too_many_connections
]);

const RETRYABLE_NODE = new Set(["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT"]);

function codeOf(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const rec = e as Record<string, unknown>;
  for (const key of ["code", "errorCode"]) {
    const v = rec[key];
    if (typeof v === "string") return v;
  }
  // Prisma wraps the driver error one level down
  const cause = rec.cause;
  if (cause && cause !== e) return codeOf(cause);
  return undefined;
}

export function isRetryable(e: unknown): boolean {
  const code = codeOf(e);
  if (!code) return false;
  return RETRYABLE_PG.has(code) || RETRYABLE_NODE.has(code);
}

/** True when the database itself is unreachable, as opposed to unhappy. */
export function isUnavailable(e: unknown): boolean {
  const code = codeOf(e);
  return (
    code === "P1001" || // Prisma: can't reach database server
    code === "P1002" || // Prisma: timed out reaching server
    code === "P1017" || // Prisma: server closed the connection
    code === "53300" ||
    (code !== undefined && RETRYABLE_NODE.has(code))
  );
}

export type DbFailure =
  | { kind: "conflict"; field?: string } // unique violation
  | { kind: "not_found" }
  | { kind: "invalid_reference" } // foreign key
  | { kind: "constraint" } // CHECK / not-null
  | { kind: "unavailable" }
  | { kind: "unknown" };

export function classify(e: unknown): DbFailure {
  const code = codeOf(e);
  if (isUnavailable(e)) return { kind: "unavailable" };

  switch (code) {
    case "P2002": // Prisma unique constraint
    case "23505": // Postgres unique_violation
      return { kind: "conflict", field: uniqueField(e) };
    case "P2025": // Prisma: record required but not found
      return { kind: "not_found" };
    case "P2003": // Prisma foreign key
    case "23503": // Postgres foreign_key_violation
      return { kind: "invalid_reference" };
    case "P2000": // value too long
    case "23514": // check_violation
    case "23502": // not_null_violation
      return { kind: "constraint" };
    default:
      return { kind: "unknown" };
  }
}

/** The column a unique violation was about, when the driver tells us. */
function uniqueField(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const meta = (e as { meta?: { target?: unknown } }).meta;
  const target = meta?.target;
  if (Array.isArray(target) && typeof target[0] === "string") return target[0];
  if (typeof target === "string") return target;
  return undefined;
}

/**
 * Run an operation, retrying only the failures that deserve it.
 *
 * Backoff is short and jittered: these are request-path retries, so the budget
 * is small — better to answer 503 quickly than to hold a request for seconds.
 */
export async function withRetry<T>(
  op: () => Promise<T>,
  { attempts = 3, baseMs = 60 }: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await op();
    } catch (e) {
      lastError = e;
      if (!isRetryable(e) || i === attempts - 1) throw e;
      const jitter = Math.floor(Math.random() * baseMs);
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i + jitter));
    }
  }
  throw lastError;
}
