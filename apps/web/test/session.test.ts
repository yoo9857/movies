import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Session cookies and JWT verification.
 *
 * `next/headers` only exists inside a request scope, so it is mocked with a
 * cookie jar that records what the real one would have been told. That keeps
 * the assertions on the parts that carry security weight: the cookie flags, the
 * pinned algorithm, and what happens to a token that has been tampered with.
 */

const SECRET = "x".repeat(48);

interface SetCall {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

let jar: Map<string, string>;
let setCalls: SetCall[];
let deleted: string[];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      jar.set(name, value);
      setCalls.push({ name, value, options });
    },
    delete: (name: string) => {
      jar.delete(name);
      deleted.push(name);
    },
  }),
}));

/** Imported fresh per test so NODE_ENV and the secret are read at call time. */
async function lib() {
  return import("@/lib/session");
}

beforeEach(() => {
  jar = new Map();
  setCalls = [];
  deleted = [];
  vi.stubEnv("SESSION_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SESSION_SECRET handling", () => {
  it("refuses to run without a secret", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    const { createSession } = await lib();
    await expect(createSession({ sub: "u1", role: "MEMBER" })).rejects.toThrow(/SESSION_SECRET/);
  });

  it("refuses a secret shorter than 32 characters", async () => {
    // Fail closed: a short HS256 key is brute-forceable.
    vi.stubEnv("SESSION_SECRET", "a".repeat(31));
    const { createSession } = await lib();
    await expect(createSession({ sub: "u1", role: "MEMBER" })).rejects.toThrow(/too short/);
  });

  it("accepts exactly 32 characters", async () => {
    vi.stubEnv("SESSION_SECRET", "a".repeat(32));
    const { createSession } = await lib();
    await expect(createSession({ sub: "u1", role: "MEMBER" })).resolves.toBeUndefined();
  });
});

describe("createSession", () => {
  it("sets an httpOnly, SameSite=Lax, path-scoped cookie", async () => {
    const { createSession, SESSION_COOKIE_NAME } = await lib();
    await createSession({ sub: "user-1", role: "ADMIN" });

    expect(setCalls).toHaveLength(1);
    const { name, options } = setCalls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
    // httpOnly is what stops an XSS from reading the session.
    expect(options.httpOnly).toBe(true);
    // SameSite=Lax is CSRF layer 1; the Origin check is layer 2.
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(60 * 60 * 24 * 7);
  });

  it("does not mark the cookie secure outside production", async () => {
    // Otherwise nobody could log in over http://localhost.
    vi.stubEnv("NODE_ENV", "development");
    const { createSession } = await lib();
    await createSession({ sub: "u1", role: "MEMBER" });
    expect(setCalls[0].options.secure).toBe(false);
  });

  it("marks the cookie secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { createSession } = await lib();
    await createSession({ sub: "u1", role: "MEMBER" });
    expect(setCalls[0].options.secure).toBe(true);
  });

  it("does not put anything beyond the subject and role in the token", async () => {
    const { createSession } = await lib();
    await createSession({ sub: "user-1", role: "ADMIN" });
    const claims = JSON.parse(
      Buffer.from(setCalls[0].value.split(".")[1], "base64url").toString("utf8"),
    );
    expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "role", "sub"]);
  });

  it("pins HS256 in the header", async () => {
    const { createSession } = await lib();
    await createSession({ sub: "u1", role: "MEMBER" });
    const header = JSON.parse(
      Buffer.from(setCalls[0].value.split(".")[0], "base64url").toString("utf8"),
    );
    expect(header.alg).toBe("HS256");
  });
});

describe("readSession", () => {
  it("round-trips a session it just created", async () => {
    const { createSession, readSession } = await lib();
    await createSession({ sub: "user-1", role: "ADMIN" });
    await expect(readSession()).resolves.toEqual({ sub: "user-1", role: "ADMIN" });
  });

  it("returns null when there is no cookie", async () => {
    const { readSession } = await lib();
    await expect(readSession()).resolves.toBeNull();
  });

  it("returns null for a tampered payload", async () => {
    const { createSession, readSession, SESSION_COOKIE_NAME } = await lib();
    await createSession({ sub: "user-1", role: "MEMBER" });

    // Re-encode the payload claiming ADMIN, keeping the original signature.
    const [h, p, s] = jar.get(SESSION_COOKIE_NAME)!.split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    claims.role = "ADMIN";
    const forged = Buffer.from(JSON.stringify(claims)).toString("base64url").replace(/=+$/, "");
    jar.set(SESSION_COOKIE_NAME, [h, forged, s].join("."));

    await expect(readSession()).resolves.toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    const { readSession, SESSION_COOKIE_NAME } = await lib();
    const foreign = await new SignJWT({ role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("attacker")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("y".repeat(48)));
    jar.set(SESSION_COOKIE_NAME, foreign);

    await expect(readSession()).resolves.toBeNull();
  });

  it("returns null for an expired token", async () => {
    const { readSession, SESSION_COOKIE_NAME } = await lib();
    const expired = await new SignJWT({ role: "MEMBER" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(SECRET));
    jar.set(SESSION_COOKIE_NAME, expired);

    await expect(readSession()).resolves.toBeNull();
  });

  it("rejects an unsigned 'alg: none' token", async () => {
    // The classic downgrade. jwtVerify pins algorithms: ["HS256"].
    const { readSession, SESSION_COOKIE_NAME } = await lib();
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "attacker", role: "ADMIN" })).toString(
      "base64url",
    );
    jar.set(SESSION_COOKIE_NAME, `${header}.${payload}.`);

    await expect(readSession()).resolves.toBeNull();
  });

  it.each(["", "not-a-jwt", "a.b.c", "....", "eyJhbGciOiJIUzI1NiJ9"])(
    "returns null for garbage cookie %j",
    async (value) => {
      const { readSession, SESSION_COOKIE_NAME } = await lib();
      jar.set(SESSION_COOKIE_NAME, value);
      await expect(readSession()).resolves.toBeNull();
    },
  );

  it("returns null when the token carries no string subject", async () => {
    const { readSession, SESSION_COOKIE_NAME } = await lib();
    const noSub = await new SignJWT({ role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    jar.set(SESSION_COOKIE_NAME, noSub);

    await expect(readSession()).resolves.toBeNull();
  });

  it("treats any unrecognised role as MEMBER, never as ADMIN", async () => {
    // Privilege must be granted explicitly; anything else is least privilege.
    const { readSession, SESSION_COOKIE_NAME } = await lib();
    for (const role of ["SUPERUSER", "admin", "", null, 1, { role: "ADMIN" }]) {
      const token = await new SignJWT({ role })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("user-1")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(SECRET));
      jar.set(SESSION_COOKIE_NAME, token);
      await expect(readSession()).resolves.toEqual({ sub: "user-1", role: "MEMBER" });
    }
  });
});

describe("destroySession", () => {
  it("deletes the session cookie", async () => {
    const { createSession, destroySession, readSession, SESSION_COOKIE_NAME } = await lib();
    await createSession({ sub: "u1", role: "MEMBER" });
    await destroySession();
    expect(deleted).toContain(SESSION_COOKIE_NAME);
    await expect(readSession()).resolves.toBeNull();
  });
});
