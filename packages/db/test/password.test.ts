import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/password";

// scrypt at N=2^16 is ~67 MB and deliberately slow. Keep the number of real
// hashes small and share them where a test only needs to read one.
const PASSWORD = "a-correct-horse-battery";
let cached: string | undefined;
async function hashOnce(): Promise<string> {
  cached ??= await hashPassword(PASSWORD);
  return cached;
}

describe("hashPassword", () => {
  it("produces the documented format: scrypt$N$r$p$salt$hash", async () => {
    const stored = await hashOnce();
    const parts = stored.split("$");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(Number(parts[1])).toBe(2 ** 16); // OWASP-aligned cost
    expect(Number(parts[2])).toBe(8);
    expect(Number(parts[3])).toBe(1);
    // 16-byte salt, 64-byte key, both base64
    expect(Buffer.from(parts[4], "base64")).toHaveLength(16);
    expect(Buffer.from(parts[5], "base64")).toHaveLength(64);
  });

  it("never stores the password in the output", async () => {
    const stored = await hashOnce();
    expect(stored).not.toContain(PASSWORD);
  });

  it("salts per call, so identical passwords do not share a hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
    // Different salt AND different derived key.
    expect(a.split("$")[4]).not.toBe(b.split("$")[4]);
    expect(a.split("$")[5]).not.toBe(b.split("$")[5]);
  });
});

describe("verifyPassword", () => {
  it("accepts the correct password", async () => {
    await expect(verifyPassword(PASSWORD, await hashOnce())).resolves.toBe(true);
  });

  it.each([
    ["", "empty"],
    ["wrong", "unrelated"],
    ["a-correct-horse-batter", "one character short"],
    ["a-correct-horse-batteryy", "one character long"],
    ["A-CORRECT-HORSE-BATTERY", "different case"],
  ])("rejects %j (%s)", async (candidate) => {
    await expect(verifyPassword(candidate, await hashOnce())).resolves.toBe(false);
  });

  // A malformed hash must be a plain `false`, never a thrown error: these
  // strings come out of a database column, and a throw at the login route
  // would turn a bad row into a 500 that distinguishes it from a wrong
  // password — an account-enumeration signal.
  it.each([
    ["", "empty string"],
    ["scrypt", "no separators"],
    ["scrypt$65536$8$1$salt", "five fields"],
    ["scrypt$65536$8$1$salt$hash$extra", "seven fields"],
    ["bcrypt$65536$8$1$c2FsdA==$aGFzaA==", "wrong algorithm"],
    ["scrypt$notanumber$8$1$c2FsdA==$aGFzaA==", "non-numeric N"],
    ["scrypt$65536$x$1$c2FsdA==$aGFzaA==", "non-numeric r"],
    ["scrypt$65536$8$y$c2FsdA==$aGFzaA==", "non-numeric p"],
    ["scrypt$65536.5$8$1$c2FsdA==$aGFzaA==", "fractional N"],
    ["$$$$$", "only separators"],
  ])("returns false for a malformed stored hash: %j (%s)", async (stored) => {
    await expect(verifyPassword("anything", stored)).resolves.toBe(false);
  });

  it("rejects a hash whose recorded key length does not match", async () => {
    // Truncating the stored key must not accidentally verify: the length check
    // guards timingSafeEqual, which throws on unequal buffers.
    const [, n, r, p, salt] = (await hashOnce()).split("$");
    const truncated = ["scrypt", n, r, p, salt, Buffer.alloc(32).toString("base64")].join("$");
    await expect(verifyPassword(PASSWORD, truncated)).resolves.toBe(false);
  });

  it("verifies a hash produced with weaker recorded parameters", async () => {
    // Parameters are read from the stored string, so raising the constants
    // later must not lock existing users out.
    const legacy = await (async () => {
      const { scrypt: scryptCb, randomBytes } = await import("node:crypto");
      const salt = randomBytes(16);
      const key = await new Promise<Buffer>((res, rej) =>
        scryptCb("legacy-pw", salt, 64, { N: 2 ** 14, r: 8, p: 1 }, (e, k) =>
          e ? rej(e) : res(k),
        ),
      );
      return ["scrypt", 2 ** 14, 8, 1, salt.toString("base64"), key.toString("base64")].join("$");
    })();

    await expect(verifyPassword("legacy-pw", legacy)).resolves.toBe(true);
    await expect(verifyPassword("wrong", legacy)).resolves.toBe(false);
  });
});
