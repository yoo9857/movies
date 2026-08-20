import { describe, expect, it } from "vitest";
import { markdownAlternateFor } from "@/lib/markdown-alternate";

/**
 * `proxy.ts` sends `Link: <…>; rel="alternate"; type="text/markdown"` on the
 * pages that have a Markdown rendition, so a client reading headers finds the
 * machine-readable form without parsing the HTML.
 *
 * The predicate has to name exactly the six sections `next.config.ts` rewrites,
 * and the shape of the match is carrying four exclusions that are easy to break
 * and invisible when broken — advertising a document that 404s is worse than
 * advertising nothing, because a crawler that fetches one and gets a 404 has no
 * reason to try the next.
 */
describe("markdownAlternateFor", () => {
  it("offers a rendition for each of the six sections that have one", () => {
    expect(markdownAlternateFor("/reviews/watch-it-for-the-dents")).toBe(
      "/reviews/watch-it-for-the-dents.md",
    );
    expect(markdownAlternateFor("/movies/casablanca-1942")).toBe("/movies/casablanca-1942.md");
    expect(markdownAlternateFor("/people/josephine-lovett")).toBe("/people/josephine-lovett.md");
    expect(markdownAlternateFor("/topics/water-that-rises")).toBe("/topics/water-that-rises.md");
    expect(markdownAlternateFor("/blog/some-post")).toBe("/blog/some-post.md");
    expect(markdownAlternateFor("/critics/jonathan-rosenbaum")).toBe(
      "/critics/jonathan-rosenbaum.md",
    );
  });

  it("says nothing about listings, which have no rendition", () => {
    for (const p of ["/", "/reviews", "/movies", "/people", "/topics", "/blog", "/critics"]) {
      expect(markdownAlternateFor(p)).toBeNull();
    }
  });

  it("says nothing about a blog shelf", () => {
    // A shelf is two segments deep. `/blog/category/issue.md` does not exist, and
    // `RESERVED_POST_SLUGS` is what keeps a post off this prefix in the first place.
    expect(markdownAlternateFor("/blog/category/issue")).toBeNull();
    expect(markdownAlternateFor("/blog/category/watchlist")).toBeNull();
  });

  it("says nothing about a dotted file sitting under a section prefix", () => {
    expect(markdownAlternateFor("/blog/feed.xml")).toBeNull();
  });

  it("does not let a rendition advertise a rendition of itself", () => {
    expect(markdownAlternateFor("/reviews/watch-it-for-the-dents.md")).toBeNull();
    expect(markdownAlternateFor("/people/josephine-lovett.md")).toBeNull();
  });

  it("says nothing about sections that have no .md endpoint", () => {
    // /watch, /stats and the static pages are real pages with no rendition. The
    // rewrite list in next.config.ts is the authority, and it names six.
    for (const p of ["/watch", "/stats", "/about", "/privacy", "/search"]) {
      expect(markdownAlternateFor(p)).toBeNull();
    }
  });

  it("says nothing about the admin and API prefixes", () => {
    expect(markdownAlternateFor("/admin/blog")).toBeNull();
    expect(markdownAlternateFor("/api/v1/health")).toBeNull();
  });
});
