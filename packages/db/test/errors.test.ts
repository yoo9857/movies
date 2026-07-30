import { describe, expect, it, vi } from "vitest";
import { classify, isRetryable, isUnavailable, withRetry } from "../src/errors";

/** A driver error carries its SQLSTATE (or Prisma code) on `.code`. */
const err = (code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(code), { code, ...extra });

describe("classify", () => {
  it("maps a unique violation to a conflict, naming the field when known", () => {
    expect(classify(err("P2002", { meta: { target: ["email"] } }))).toEqual({
      kind: "conflict",
      field: "email",
    });
    // Postgres SQLSTATE, no Prisma meta
    expect(classify(err("23505"))).toEqual({ kind: "conflict", field: undefined });
  });

  it("accepts a string target as well as an array", () => {
    expect(classify(err("P2002", { meta: { target: "username" } }))).toEqual({
      kind: "conflict",
      field: "username",
    });
  });

  it("maps foreign-key violations to invalid_reference", () => {
    expect(classify(err("P2003")).kind).toBe("invalid_reference");
    expect(classify(err("23503")).kind).toBe("invalid_reference");
  });

  it("maps CHECK, not-null and over-length to constraint", () => {
    // 23514 is what the rating/slug/counter CHECKs in the constraints
    // migration raise — the route answers 422, not 500.
    expect(classify(err("23514")).kind).toBe("constraint");
    expect(classify(err("23502")).kind).toBe("constraint");
    expect(classify(err("P2000")).kind).toBe("constraint");
  });

  it("maps a missing required record to not_found", () => {
    expect(classify(err("P2025")).kind).toBe("not_found");
  });

  it.each(["P1001", "P1002", "P1017", "53300", "ECONNRESET", "ETIMEDOUT"])(
    "maps %s to unavailable",
    (code) => {
      expect(classify(err(code)).kind).toBe("unavailable");
    },
  );

  it("prefers unavailable over conflict when a code is both", () => {
    // 53300 (too_many_connections) is in the retryable set and the unavailable
    // set. The unavailable check runs first, so the client gets 503 + Retry-After
    // instead of a nonsensical 409.
    expect(classify(err("53300")).kind).toBe("unavailable");
  });

  it("unwraps a driver error nested under cause, as Prisma wraps it", () => {
    const wrapped = Object.assign(new Error("prisma"), { cause: err("23505") });
    expect(classify(wrapped).kind).toBe("conflict");
  });

  it("unwraps more than one level", () => {
    const deep = Object.assign(new Error("outer"), {
      cause: Object.assign(new Error("middle"), { cause: err("23514") }),
    });
    expect(classify(deep).kind).toBe("constraint");
  });

  it("does not loop forever on a self-referencing cause", () => {
    const self: Record<string, unknown> = { message: "loop" };
    self.cause = self;
    expect(classify(self).kind).toBe("unknown");
  });

  it.each([null, undefined, "a string", 42, {}, new Error("no code")])(
    "returns unknown for %j",
    (value) => {
      expect(classify(value).kind).toBe("unknown");
    },
  );

  it("reads errorCode as well as code", () => {
    expect(classify({ errorCode: "23505" }).kind).toBe("conflict");
  });
});

describe("isRetryable", () => {
  it.each(["40001", "40P01", "57P03", "08006", "08003", "08000", "53300"])(
    "retries SQLSTATE %s",
    (code) => {
      expect(isRetryable(err(code))).toBe(true);
    },
  );

  it.each(["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT"])("retries %s", (code) => {
    expect(isRetryable(err(code))).toBe(true);
  });

  it("never retries a request that was simply wrong", () => {
    // A unique violation will fail identically every time; retrying it just
    // spends the request budget.
    expect(isRetryable(err("23505"))).toBe(false);
    expect(isRetryable(err("23514"))).toBe(false);
    expect(isRetryable(err("P2002"))).toBe(false);
    expect(isRetryable(new Error("no code"))).toBe(false);
  });
});

describe("isUnavailable", () => {
  it("separates unreachable from unhappy", () => {
    expect(isUnavailable(err("P1001"))).toBe(true);
    expect(isUnavailable(err("40001"))).toBe(false); // deadlock: reachable, retryable
    expect(isUnavailable(err("23505"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns the first success without retrying", async () => {
    const op = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(op)).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and then succeeds", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(err("40P01"))
      .mockResolvedValue("recovered");
    await expect(withRetry(op, { baseMs: 1 })).resolves.toBe("recovered");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempt budget and rethrows the last error", async () => {
    const op = vi.fn().mockRejectedValue(err("40001"));
    await expect(withRetry(op, { attempts: 3, baseMs: 1 })).rejects.toMatchObject({
      code: "40001",
    });
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable failure at all", async () => {
    const op = vi.fn().mockRejectedValue(err("23505"));
    await expect(withRetry(op, { attempts: 5, baseMs: 1 })).rejects.toMatchObject({
      code: "23505",
    });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("honours attempts: 1 as 'do not retry'", async () => {
    const op = vi.fn().mockRejectedValue(err("40001"));
    await expect(withRetry(op, { attempts: 1, baseMs: 1 })).rejects.toMatchObject({
      code: "40001",
    });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("backs off between attempts rather than hammering", async () => {
    const op = vi.fn().mockRejectedValue(err("40001"));
    const started = Date.now();
    await withRetry(op, { attempts: 3, baseMs: 20 }).catch(() => {});
    // Two waits: >= 20 and >= 40 before the jitter.
    expect(Date.now() - started).toBeGreaterThanOrEqual(60);
  });
});
