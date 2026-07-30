import { describe, expect, it } from "vitest";
import { isPrivateAddress } from "@/lib/media/image";

/**
 * The address classifier behind fetchRemoteImage's SSRF guard. Each entry here
 * is a place an attacker-supplied image URL must never be able to reach —
 * loopback, the LAN, link-local (where cloud metadata lives) — plus the public
 * addresses that must keep working, since Wikimedia imports go through the
 * same gate.
 */
describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", // loopback
    "127.8.8.8", // all of 127/8, not just .1
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1", // CGNAT
    "169.254.169.254", // cloud metadata
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "192.0.0.192",
    "198.18.0.1", // benchmarking
    "224.0.0.1", // multicast
    "255.255.255.255",
    "::1",
    "::",
    "fd12:3456::1", // unique local
    "fe80::1", // link-local
    "::ffff:192.168.1.1", // v4 hiding inside v6
    "::ffff:127.0.0.1",
    "not-an-ip", // unparseable — refuse, don't guess
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "208.80.154.224", // wikimedia.org
    "172.15.0.1", // just below the 172.16/12 block
    "172.32.0.1", // just above it
    "100.63.0.1", // below CGNAT
    "100.128.0.1", // above CGNAT
    "9.255.255.255", // below 10/8
    "11.0.0.1", // above 10/8
    "2620:0:862:ed1a::1", // wikimedia v6
    "::ffff:8.8.8.8", // embedded v4 that is genuinely public
  ])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});
