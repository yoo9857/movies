import { describe, expect, it } from "vitest";
import { pageMetadata } from "@/lib/seo";

/**
 * A section with a name owes that section a feed.
 *
 * The site feed interleaves reviews, blog posts and topic essays — right for
 * someone following CinePixo, wrong for someone who subscribed from inside the
 * blog and got a scored argument about a film they never asked about. These
 * pin that both are offered and that the section's own comes first.
 */
const BLOG_FEED = [{ path: "/blog/feed.xml", title: "Off Camera — the CinePixo blog" }] as const;

function rssTypes(meta: ReturnType<typeof pageMetadata>) {
  return meta.alternates?.types?.["application/rss+xml"];
}

describe("feed discovery", () => {
  it("offers the section feed first, then the whole site", () => {
    const types = rssTypes(pageMetadata({ path: "/blog", title: "Off Camera", feeds: BLOG_FEED }));
    expect(Array.isArray(types)).toBe(true);
    const list = types as { url: string; title?: string }[];
    expect(list[0].url).toContain("/blog/feed.xml");
    expect(list[0].title).toBe("Off Camera — the CinePixo blog");
    expect(list.at(-1)?.url).toContain("/feed.xml");
    expect(list.at(-1)?.url).not.toContain("/blog/");
  });

  it("leaves every other page on the site feed alone", () => {
    expect(rssTypes(pageMetadata({ path: "/movies", title: "Films" }))).toContain("/feed.xml");
  });

  it("keeps the JSON feed and the markdown rendition alongside", () => {
    const meta = pageMetadata({
      path: "/blog/a-piece",
      title: "A piece",
      feeds: BLOG_FEED,
      markdownPath: "/blog/a-piece.md",
    });
    expect(meta.alternates?.types?.["application/feed+json"]).toContain("/feed.json");
    expect(meta.alternates?.types?.["text/markdown"]).toContain("/blog/a-piece.md");
    // The canonical is still the page, not either rendition of it.
    expect(meta.alternates?.canonical).toContain("/blog/a-piece");
  });
});
