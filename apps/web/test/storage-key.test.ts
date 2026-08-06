import { describe, expect, it } from "vitest";
import { buildKey, publicBasePrefix } from "@/lib/media/storage";

/**
 * The bug this pins: the site shares a bucket with another service, so its
 * public base carries a path segment (`…/cinepixo`). That segment is part of
 * every object's key. Writing without it produced seven uploads that all
 * reported success and all 404'd — the PUT was real, the URL was well-formed,
 * and the two named different objects.
 */
describe("publicBasePrefix", () => {
  it("finds the path segment a shared bucket's base carries", () => {
    expect(publicBasePrefix("https://bucket.us-lax-4.linodeobjects.com/cinepixo")).toBe("cinepixo");
    expect(publicBasePrefix("https://bucket.us-lax-4.linodeobjects.com/cinepixo/")).toBe("cinepixo");
    expect(publicBasePrefix("https://cdn.example.com/a/b")).toBe("a/b");
  });

  it("is empty when the base is a bare host, so keys stay unprefixed", () => {
    expect(publicBasePrefix("https://bucket.us-lax-4.linodeobjects.com")).toBe("");
    expect(publicBasePrefix("https://bucket.us-lax-4.linodeobjects.com/")).toBe("");
  });

  it("answers empty rather than throwing on nonsense", () => {
    expect(publicBasePrefix("")).toBe("");
    expect(publicBasePrefix("not a url")).toBe("");
  });
});

describe("buildKey", () => {
  it("keeps the same shape on either driver — the bucket prefix is added at write time", () => {
    expect(buildKey("posts", "webp")).toMatch(/^posts\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/);
  });

  it("refuses to let a kind or extension smuggle a path in", () => {
    expect(buildKey("../../etc", "webp")).toMatch(/^etc\//);
    expect(buildKey("posts", "web/p")).toMatch(/\.webp$/);
  });
});
