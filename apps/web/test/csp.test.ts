import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, newNonce, xsltDocumentPolicy } from "@/lib/csp";

/**
 * The policy that lets an ad network run someone else's code here.
 *
 * These tests exist because the first version of this file did not: the CSP
 * shipped as a hand-kept list of Google hostnames, which is the one arrangement
 * AdSense documents as unsupported ("the domains that the AdSense ad code uses
 * change over time, we only support strict CSP"). The failure mode is silent —
 * the header is valid, the page renders, and only the ad, or the consent
 * message the EEA legally requires, quietly never loads.
 *
 * So what is pinned here is the *shape* of the policy, not a list of hosts.
 */

/** Pull one directive out of the header, without its name. */
function directive(csp: string, name: string): string {
  const found = csp
    .split("; ")
    .find((d) => d === name || d.startsWith(`${name} `));
  if (!found) throw new Error(`no ${name} in policy`);
  return found.slice(name.length).trim();
}

const NONCE = "test-nonce";
const ACCOUNT = "ca-pub-9021429421997169";

const withAds = () =>
  contentSecurityPolicy({ nonce: NONCE, isDev: false, adsense: ACCOUNT });
const withoutAds = () =>
  contentSecurityPolicy({ nonce: NONCE, isDev: false, adsense: undefined });

describe("script-src", () => {
  it("trusts a nonce and what the nonce loads, never a hostname", () => {
    const script = directive(withAds(), "script-src");

    expect(script).toContain(`'nonce-${NONCE}'`);
    expect(script).toContain("'strict-dynamic'");
    // The regression this whole file is about: naming Google's hosts here is
    // what breaks the day Google adds one.
    expect(script).not.toContain("googlesyndication");
    expect(script).not.toContain("doubleclick");
    expect(script).not.toContain("fundingchoices");
  });

  it("keeps a fallback for browsers that ignore strict-dynamic", () => {
    // Both are dead weight in a modern browser — which is the point: one
    // header serves old and new, and the old branch is the looser one.
    expect(directive(withAds(), "script-src")).toContain("'unsafe-inline'");
    expect(directive(withAds(), "script-src")).toContain("https:");
  });

  it("does not widen itself when there is no publisher id", () => {
    const script = directive(withoutAds(), "script-src");

    expect(script).toContain(`'nonce-${NONCE}'`);
    expect(script).toContain("'strict-dynamic'");
    // No ads, no eval, and the legacy fallback is our own origin rather than
    // the whole of https — a preview build stays as tight as it ever was.
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).not.toContain("https:");
    expect(script).toContain("'self'");
  });

  it("allows eval only for the ad code, and in development", () => {
    expect(directive(withAds(), "script-src")).toContain("'unsafe-eval'");
    expect(
      directive(
        contentSecurityPolicy({ nonce: NONCE, isDev: true, adsense: undefined }),
        "script-src",
      ),
    ).toContain("'unsafe-eval'");
  });
});

describe("the directives strict-dynamic does not cover", () => {
  it("admits Google's consent message, which is not optional in the EEA", () => {
    // A certified CMP is mandatory for EEA/UK/Swiss traffic. Google's own is
    // served from this host, draws itself in an iframe, and calls home — miss
    // any one of the three and readers there get no ads at all.
    const csp = withAds();
    const cmp = "https://fundingchoicesmessages.google.com";

    expect(directive(csp, "frame-src")).toContain(cmp);
    expect(directive(csp, "img-src")).toContain(cmp);
    expect(directive(csp, "connect-src")).toContain(cmp);
  });

  it("keeps the trailer domain and our own media, ads or not", () => {
    for (const csp of [withAds(), withoutAds()]) {
      expect(directive(csp, "frame-src")).toContain("https://www.youtube-nocookie.com");
      expect(directive(csp, "media-src")).toContain("pokemon-dive");
    }
  });

  it("names no ad host at all without a publisher id", () => {
    const csp = withoutAds();
    for (const name of ["frame-src", "img-src", "connect-src"]) {
      expect(directive(csp, name)).not.toContain("google");
    }
  });
});

/**
 * The sitemap and the feed render through our own XSLT so a person opening one
 * sees a table rather than tags. Chromium checks that stylesheet against
 * `script-src`, and a stylesheet named by a processing instruction cannot carry a
 * nonce — so under `'strict-dynamic'`, which ignores `'self'` by design, the
 * transform was refused and the page came up blank. Valid XML, correct
 * stylesheet, nothing on screen.
 */
describe("the policy for XSLT-rendered documents", () => {
  it("lets 'self' mean what it says, because a stylesheet cannot be nonced", () => {
    const script = directive(xsltDocumentPolicy(), "script-src");
    expect(script).toBe("'self'");
    expect(script).not.toContain("strict-dynamic");
    expect(script).not.toContain("nonce");
  });

  it("allows the one inline style block the transform writes", () => {
    expect(directive(xsltDocumentPolicy(), "style-src")).toContain("'unsafe-inline'");
  });

  it("gives up nothing else in exchange", () => {
    const csp = xsltDocumentPolicy();
    expect(directive(csp, "default-src")).toBe("'self'");
    expect(directive(csp, "object-src")).toBe("'none'");
    expect(directive(csp, "frame-src")).toBe("'none'");
    expect(directive(csp, "frame-ancestors")).toBe("'none'");
    expect(directive(csp, "base-uri")).toBe("'self'");
    expect(directive(csp, "form-action")).toBe("'self'");
    // These documents carry our URLs and titles; they have no business reaching
    // an ad network, and no eval anywhere.
    expect(csp).not.toContain("googlesyndication");
    expect(csp).not.toContain("unsafe-eval");
  });
});

describe("the parts that are not about ads", () => {
  it("keeps the clickjacking and injection floor", () => {
    const csp = withAds();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
  });
});

describe("newNonce", () => {
  it("is different every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => newNonce()));
    expect(seen.size).toBe(50);
  });

  it("survives a header round trip", () => {
    // A nonce with a space or a quote in it would end the source expression
    // early and take the rest of the directive with it.
    expect(newNonce()).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
