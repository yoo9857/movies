import { describe, expect, it } from "vitest";
import {
  POST_CATEGORY_LABELS,
  RESERVED_POST_SLUGS,
  SOURCED_CATEGORIES,
  postCategoryFromSlug,
  postCategorySchema,
  postCategorySlug,
  postInputSchema,
  sourceHost,
} from "../src/index";

/**
 * The blog's input contract.
 *
 * The rule worth testing here is the one the database also enforces: a post
 * about living people or a live argument cannot be published without a source.
 * `Post_claims_are_sourced` is the guarantee; this schema is what turns the
 * violation into a sentence attached to the right field, and the two must agree
 * about which categories are covered — so `SOURCED_CATEGORIES` is asserted
 * against the same list the migration names.
 */

/** A minimal valid post, for tests that vary one field at a time. */
const post = {
  slug: "song-kang-ho-off-camera",
  title: "Song Kang-ho on the year he stopped saying yes",
  content: "He was reading four scripts a week.",
  category: "CRAFT" as const,
  status: "DRAFT" as const,
};

const parse = (extra: Record<string, unknown> = {}) =>
  postInputSchema.safeParse({ ...post, ...extra });

/**
 * A hero always carries alt text (`Post_image_needs_alt`), so tests about some
 * *other* image rule supply it rather than restating that one. The tests that
 * are about alt pass it — or withhold it — explicitly.
 */
const withHero = (extra: Record<string, unknown> = {}) =>
  parse({ imageAlt: "What the picture shows", ...extra });

describe("the sources rule", () => {
  it("names exactly the categories the CHECK constraint names", () => {
    // If this list and `Post_claims_are_sourced` ever disagree, one of them is
    // letting an unsourced claim through or refusing a legitimate save.
    expect([...SOURCED_CATEGORIES].sort()).toEqual(["ISSUE", "PEOPLE"]);
  });

  it.each(SOURCED_CATEGORIES)("refuses to publish %s with no source", (category) => {
    const res = parse({ category, status: "PUBLISHED" });
    expect(res.success).toBe(false);
    // The message has to land on the field the editor must fix.
    expect(res.error?.issues[0]?.path).toEqual(["sources"]);
  });

  it.each(SOURCED_CATEGORIES)("allows %s as a draft with no source", (category) => {
    expect(parse({ category, status: "DRAFT" }).success).toBe(true);
  });

  it.each(SOURCED_CATEGORIES)("publishes %s once a source exists", (category) => {
    expect(
      parse({ category, status: "PUBLISHED", sources: ["https://example.com/x"] }).success,
    ).toBe(true);
  });

  it.each(["INDUSTRY", "CRAFT", "WATCHLIST"] as const)(
    "publishes %s with no source — it is our own reading",
    (category) => {
      expect(parse({ category, status: "PUBLISHED" }).success).toBe(true);
    },
  );

  it("rejects a source that is not an http(s) URL", () => {
    // A source is evidence; an unfetchable string is not evidence.
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "not a url", "ftp://x/y"]) {
      expect(parse({ sources: [bad] }).success).toBe(false);
    }
  });

  it("caps the list rather than accepting an unbounded array", () => {
    const many = Array.from({ length: 21 }, (_, i) => `https://example.com/${i}`);
    expect(parse({ sources: many }).success).toBe(false);
  });
});

describe("reserved slugs", () => {
  it("refuses a slug the /blog routes have already spent", () => {
    // /blog/category/people is a shelf; a post slugged "category" would publish
    // at a URL Next resolves to the shelf route, so nothing could reach it.
    for (const slug of RESERVED_POST_SLUGS) {
      expect(parse({ slug }).success).toBe(false);
    }
  });

  it("still accepts a slug that merely contains a reserved word", () => {
    expect(parse({ slug: "category-error-2026" }).success).toBe(true);
  });
});

describe("the hero image", () => {
  it("takes one of ours — a path or an https URL", () => {
    expect(withHero({ image: "/uploads/posts/2026/08/x.webp" }).success).toBe(true);
    expect(
      withHero({ image: "https://pokemon-dive.us-lax-4.linodeobjects.com/cinepixo/x.webp" })
        .success,
    ).toBe(true);
  });

  it("rejects the shapes that can never be ours", () => {
    for (const bad of ["http://example.com/x.jpg", "javascript:alert(1)", "example.com/x.jpg"]) {
      expect(parse({ image: bad }).success).toBe(false);
    }
  });

  it("normalises an empty string away, as every optional field here does", () => {
    const res = postInputSchema.parse({ ...post, image: "", dek: "  " });
    expect(res.image).toBeUndefined();
    expect(res.dek).toBeUndefined();
  });

  it("refuses a licence with no source page", () => {
    const res = parse({
      image: "/uploads/posts/x.webp",
      imageLicense: "CC BY-SA 4.0",
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path).toEqual(["imageSourceUrl"]);
  });

  it("accepts a licence once its source is named", () => {
    expect(
      withHero({
        image: "/uploads/posts/x.webp",
        imageLicense: "CC BY-SA 4.0",
        imageSourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
      }).success,
    ).toBe(true);
  });

  it("refuses alt text or credit with no image to describe", () => {
    expect(parse({ imageAlt: "A face" }).success).toBe(false);
    expect(parse({ imageCredit: "Photograph by Someone" }).success).toBe(false);
  });

  /**
   * The other direction. `alt=""` reads to a screen reader as "decorative,
   * skip this" — over a photograph of the person the piece is about, that
   * deletes the subject of the article for the reader who most needs it named.
   */
  it("refuses a hero with no alt text, and says which field is wrong", () => {
    const res = parse({ image: "/uploads/posts/x.webp" });
    expect(res.success).toBe(false);
    expect(res.error?.issues.some((i) => i.path[0] === "imageAlt")).toBe(true);
  });

  it("counts blank alt text as none, the way the constraint does", () => {
    expect(parse({ image: "/uploads/posts/x.webp", imageAlt: "   " }).success).toBe(false);
  });

  it("has nothing to say about a post with no picture", () => {
    expect(parse({}).success).toBe(true);
  });
});

describe("category slugs round-trip", () => {
  it("maps every category to a URL segment and back", () => {
    for (const c of postCategorySchema.options) {
      expect(postCategoryFromSlug(postCategorySlug(c))).toBe(c);
    }
  });

  it("answers null for anything that is not a shelf", () => {
    // The shelf route depends on this: an unknown segment is a 404, not a query.
    for (const bad of ["PEOPLE", "people ", "reviews", "", "../people"]) {
      expect(postCategoryFromSlug(bad)).toBeNull();
    }
  });

  it("has a printable label for every category", () => {
    for (const c of postCategorySchema.options) {
      expect(POST_CATEGORY_LABELS[c]).toBeTruthy();
    }
  });
});

describe("sourceHost", () => {
  it("credits the publisher's own domain, without www", () => {
    expect(sourceHost("https://www.variety.com/2026/film/news/x")).toBe("variety.com");
    expect(sourceHost("https://news.bbc.co.uk/x")).toBe("news.bbc.co.uk");
  });

  it("returns the input unchanged rather than throwing on junk", () => {
    // Rendered in a list on a live page; a parse error here would take the page
    // down over a malformed row.
    expect(sourceHost("not a url")).toBe("not a url");
  });
});

describe("defaults", () => {
  it("fills every list so a caller never has to", () => {
    const res = postInputSchema.parse(post);
    expect(res.tags).toEqual([]);
    expect(res.sources).toEqual([]);
    expect(res.personIds).toEqual([]);
    expect(res.movieIds).toEqual([]);
  });
});
