import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, handle, parseJson, requireSameOrigin } from "@/lib/api";

/** A driver error as the pg adapter would raise it. */
const dbErr = (code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(code), { code, ...extra });

const post = (headers: Record<string, string>, body?: string) =>
  new Request("https://cinepixo.com/api/v1/reviews", {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body }),
  });

beforeEach(() => {
  // `handle` logs the unexpected cases; keep the suite output readable while
  // still asserting that nothing sensitive reaches the client.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requireSameOrigin", () => {
  it("allows a request with no Origin header", () => {
    // The native app and curl send none; SameSite=Lax covers browsers.
    expect(() => requireSameOrigin(post({ host: "cinepixo.com" }))).not.toThrow();
  });

  it("allows a matching origin", () => {
    expect(() =>
      requireSameOrigin(post({ host: "cinepixo.com", origin: "https://cinepixo.com" })),
    ).not.toThrow();
  });

  it("allows a matching origin on a non-default port", () => {
    expect(() =>
      requireSameOrigin(post({ host: "localhost:3000", origin: "http://localhost:3000" })),
    ).not.toThrow();
  });

  it.each([
    ["https://evil.com", "cinepixo.com", "different host"],
    ["https://cinepixo.com.evil.com", "cinepixo.com", "suffix attack"],
    ["https://evil.com/cinepixo.com", "cinepixo.com", "path lookalike"],
    ["http://localhost:3001", "localhost:3000", "port mismatch"],
    ["null", "cinepixo.com", "opaque origin from a sandboxed iframe"],
    ["not a url", "cinepixo.com", "unparseable"],
  ])("rejects origin %j against host %j (%s)", (origin, host) => {
    expect(() => requireSameOrigin(post({ host, origin }))).toThrow(ApiError);
    try {
      requireSameOrigin(post({ host, origin }));
    } catch (e) {
      expect((e as ApiError).status).toBe(403);
    }
  });

  it("rejects when Origin is present but Host is missing", () => {
    const req = new Request("https://cinepixo.com/x", { method: "POST" });
    // Host is a forbidden header name in the fetch API, so build the mismatch
    // by handing over a request whose headers carry only Origin.
    Object.defineProperty(req, "headers", {
      value: new Headers({ origin: "https://cinepixo.com" }),
    });
    expect(() => requireSameOrigin(req)).toThrow(ApiError);
  });
});

describe("parseJson", () => {
  it("returns the parsed body", async () => {
    await expect(
      parseJson(post({ "content-type": "application/json" }, '{"a":1}')),
    ).resolves.toEqual({ a: 1 });
  });

  it("turns malformed JSON into a 400, not a 500", async () => {
    await expect(
      parseJson(post({ "content-type": "application/json" }, "{oops")),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("handle", () => {
  const run = (fn: () => Promise<never>) => handle(fn)();

  it("passes a successful response through untouched", async () => {
    const res = await handle(async () => Response.json({ ok: true }) as never)();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("turns a ZodError into a 400 listing the offending paths", async () => {
    const schema = z.object({ rating: z.number().max(10) });
    const res = await run(async () => {
      schema.parse({ rating: 99 });
      throw new Error("unreachable");
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toEqual([{ path: "rating", message: expect.any(String) }]);
  });

  it("uses an ApiError's own status and message", async () => {
    const res = await run(async () => {
      throw new ApiError(404, "Review not found");
    });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Review not found" });
  });

  it("answers 409 for a unique violation and names the field", async () => {
    const res = await run(async () => {
      throw dbErr("P2002", { meta: { target: ["email"] } });
    });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "That email is already taken" });
  });

  it("answers 409 without a field name when the driver does not say", async () => {
    const res = await run(async () => {
      throw dbErr("23505");
    });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "That already exists" });
  });

  it("answers 422 for a CHECK violation", async () => {
    // e.g. a rating of 9.25 slipping past the app into Review_rating_step
    const res = await run(async () => {
      throw dbErr("23514");
    });
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "That value is not allowed" });
  });

  it("answers 400 for a foreign-key violation", async () => {
    const res = await run(async () => {
      throw dbErr("23503");
    });
    expect(res.status).toBe(400);
  });

  it("answers 404 for a required record that is missing", async () => {
    const res = await run(async () => {
      throw dbErr("P2025");
    });
    expect(res.status).toBe(404);
  });

  it("answers 503 with Retry-After when the database is unreachable", async () => {
    const res = await run(async () => {
      throw dbErr("P1001");
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("5");
  });

  it("answers an opaque 500 for anything else, leaking nothing", async () => {
    const secret = "postgresql://cinepixo:hunter2@127.0.0.1:5435/cinepixo";
    const res = await run(async () => {
      throw new Error(`connection refused: ${secret}`);
    });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "Internal server error" });
    // The message, the credentials and any stack must not reach the client.
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("5435");
    expect(text).not.toContain("connection refused");
  });

  it("does not leak a constraint name on a database failure", async () => {
    const res = await run(async () => {
      throw dbErr("23514", { constraint: "Review_rating_step" });
    });
    expect(await res.text()).not.toContain("Review_rating_step");
  });

  it("forwards the handler's own arguments", async () => {
    const fn = vi.fn<(...args: unknown[]) => Promise<never>>(
      async () => Response.json({}) as never,
    );
    await handle(fn)("a", 1);
    expect(fn).toHaveBeenCalledWith("a", 1);
  });
});
