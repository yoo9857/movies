import { describe, expect, it } from "vitest";
import { canonicalHostRedirect } from "@/lib/canonical-host";

describe("canonical host redirect", () => {
  it("redirects the owned www alias and preserves path and query", () => {
    expect(
      canonicalHostRedirect(
        "https://cinepixo.com",
        "http://127.0.0.1:3400/people/peter-r-adam?view=credits",
        "www.cinepixo.com",
      )?.href,
    ).toBe("https://cinepixo.com/people/peter-r-adam?view=credits");
  });

  it("does nothing on the canonical host", () => {
    expect(
      canonicalHostRedirect("https://cinepixo.com", "http://127.0.0.1:3400/", "cinepixo.com"),
    ).toBeNull();
  });

  it("does not redirect an arbitrary Host header", () => {
    expect(
      canonicalHostRedirect("https://cinepixo.com", "http://127.0.0.1:3400/", "attacker.test"),
    ).toBeNull();
  });
});
