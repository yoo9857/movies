import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pageMetadata } from "@/lib/seo";

describe("editorial primary-image metadata", () => {
  it("publishes one preferred image consistently to Open Graph and Twitter", () => {
    const image = "https://cdn.example.com/article.webp";
    const metadata = pageMetadata({
      path: "/blog/an-article",
      title: "An article",
      images: [{ url: image, alt: "A representative scene" }],
    });

    expect(metadata.openGraph?.images).toEqual([{ url: image, alt: "A representative scene" }]);
    expect(metadata.twitter?.images).toEqual([image]);
  });

  it("does not let a file-based per-article card override the preferred image", () => {
    const root = new URL("../src/app/(site)/", import.meta.url);
    expect(existsSync(new URL("blog/[slug]/opengraph-image.tsx", root))).toBe(false);
    expect(existsSync(new URL("reviews/[slug]/opengraph-image.tsx", root))).toBe(false);

    // Next does not inherit those section files into a dynamic child route;
    // each page therefore spells the root card as its explicit fallback.
    for (const page of ["blog/[slug]/page.tsx", "reviews/[slug]/page.tsx"]) {
      const source = readFileSync(new URL(page, root), "utf8");
      expect(source).toContain('absUrl("/opengraph-image.png")');
    }
  });
});
