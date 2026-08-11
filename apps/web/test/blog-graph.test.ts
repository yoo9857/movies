import { describe, expect, it } from "vitest";
import {
  BLOG_ID,
  blogNode,
  graph,
  movieEntityId,
  peopleEntityId,
  type PostInput,
  postEntityId,
  postNode,
} from "@/lib/seo";

/**
 * How a blog post is wired into the graph.
 *
 * Three rules are defended here, each of which was a decision rather than a
 * default:
 *
 *  · **the sources reach the markup.** A `Post_claims_are_sourced` constraint
 *    demands a citation for the shelves that make claims about living people; if
 *    the graph drops it, an answer engine quotes the claim with nothing behind
 *    it, and the constraint bought us nothing.
 *  · **`about` is the first subject, `mentions` is the rest.** The curated sort
 *    order is a real claim about what the piece is on. Flattening every subject
 *    into `about` would have a profile of one actor asserting it is equally about
 *    the six films listed under them.
 *  · **no rating, ever.** A post has no score. A `reviewRating` here — copied
 *    from reviewNode in a hurry — would be a rating with nothing on the page.
 */

const AUTHOR = { username: "desk", displayName: "The Desk" };

const POST: PostInput = {
  slug: "song-kang-ho-off-camera",
  title: "Song Kang-ho on the year he stopped saying yes",
  dek: "Two refusals, one of them to a director he had never turned down before.",
  content: "## The first no\n\nHe was reading four scripts a week.",
  categoryLabel: "Away From Set",
  tags: ["korean cinema", "casting"],
  sources: ["https://example.com/interview", "https://example.org/report"],
  publishedAt: new Date("2026-08-05T09:00:00.000Z"),
  updatedAt: new Date("2026-08-06T11:30:00.000Z"),
};

const node = (extra: Partial<typeof POST> = {}, opts: Parameters<typeof postNode>[1] = { author: AUTHOR }) =>
  postNode({ ...POST, ...extra }, opts) as unknown as Record<string, unknown>;

describe("postNode identity", () => {
  it("is a BlogPosting owned by its page and part of the one Blog", () => {
    const n = node();
    expect(n["@type"]).toBe("BlogPosting");
    expect(n["@id"]).toBe(postEntityId(POST.slug));
    expect(n.url).toBe("http://localhost:3000/blog/song-kang-ho-off-camera");
    expect(n.isPartOf).toEqual({ "@id": BLOG_ID });
    expect(n.mainEntityOfPage).toEqual({
      "@id": "http://localhost:3000/blog/song-kang-ho-off-camera#webpage",
    });
  });

  it("names the shelf as articleSection and the tags as keywords", () => {
    const n = node();
    expect(n.articleSection).toBe("Away From Set");
    expect(n.keywords).toBe("korean cinema, casting");
  });

  it("clamps the headline to what a result will show, keeping the full name", () => {
    const long = "A ".repeat(90).trim();
    const n = node({ title: long });
    expect((n.headline as string).length).toBeLessThanOrEqual(110);
    expect(n.name).toBe(long);
  });

  it("carries no rating of any kind — a post is not a review", () => {
    const json = JSON.stringify(node());
    expect(json).not.toContain("Rating");
    expect(json).not.toContain("ratingValue");
  });

  it("timestamps carry a zone, and dateModified falls back to publication", () => {
    const withZone = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;
    expect(node().datePublished).toMatch(withZone);
    expect(node().dateModified).toMatch(withZone);
    expect(node({ updatedAt: null }).dateModified).toBe(node().datePublished);
  });
});

describe("sources become citations", () => {
  it("emits one CreativeWork per source URL, in order", () => {
    expect(node().citation).toEqual([
      { "@type": "CreativeWork", url: "https://example.com/interview" },
      { "@type": "CreativeWork", url: "https://example.org/report" },
    ]);
  });

  it("omits the property rather than asserting an empty list", () => {
    // `compact()` exists for exactly this: `citation: []` claims "we cite
    // nothing", which is a different statement from "no citations here".
    expect("citation" in node({ sources: [] })).toBe(false);
  });
});

describe("what the piece is about", () => {
  const SUBJECTS = [
    peopleEntityId("song-kang-ho"),
    movieEntityId("parasite-2019"),
    movieEntityId("memories-of-murder-2003"),
  ];

  it("puts the first subject in `about` and the rest in `mentions`", () => {
    const n = node({}, { author: AUTHOR, subjectIds: SUBJECTS });
    expect(n.about).toEqual({ "@id": SUBJECTS[0] });
    expect(n.mentions).toEqual([{ "@id": SUBJECTS[1] }, { "@id": SUBJECTS[2] }]);
  });

  it("omits `mentions` when there is only one subject", () => {
    const n = node({}, { author: AUTHOR, subjectIds: [SUBJECTS[0]] });
    expect(n.about).toEqual({ "@id": SUBJECTS[0] });
    expect("mentions" in n).toBe(false);
  });

  it("omits both when the piece names nobody", () => {
    const n = node({}, { author: AUTHOR, subjectIds: [] });
    expect("about" in n).toBe(false);
    expect("mentions" in n).toBe(false);
  });

  it("references subjects by @id and never inlines them", () => {
    const n = node({}, { author: AUTHOR, subjectIds: SUBJECTS });
    expect(Object.keys(n.about as object)).toEqual(["@id"]);
    for (const m of n.mentions as object[]) expect(Object.keys(m)).toEqual(["@id"]);
  });
});

describe("the body is included only where the page renders it", () => {
  it("emits articleBody, wordCount and timeRequired when asked", () => {
    const n = node({}, { author: AUTHOR, includeBody: true });
    expect(n.articleBody).toContain("reading four scripts");
    // Markdown heading marks are not prose.
    expect(n.articleBody).not.toContain("##");
    expect(typeof n.wordCount).toBe("number");
    expect(n.timeRequired).toMatch(/^PT\d+M$/);
  });

  it("leaves all three out for a list page", () => {
    const n = node();
    for (const key of ["articleBody", "wordCount", "timeRequired"]) {
      expect(key in n).toBe(false);
    }
  });
});

/** A hero as the Commons importer stores one: file, alt, credit, terms, source. */
const LICENSED: Partial<PostInput> = {
  image: "/uploads/posts/2026/08/x.webp",
  imageAlt: "Song Kang-ho at a press call",
  imageCredit: "Photograph by Someone",
  imageLicense: "CC BY-SA 4.0",
  imageLicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  imageSourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
};

describe("the hero carries its terms", () => {
  it("absolutises our path and passes a bucket URL through untouched", () => {
    const local = node(LICENSED).image as Record<string, unknown>;
    expect(local.url).toBe("http://localhost:3000/uploads/posts/2026/08/x.webp");

    const bucket = "https://pokemon-dive.us-lax-4.linodeobjects.com/cinepixo/posts/x.webp";
    expect((node({ ...LICENSED, image: bucket }).image as Record<string, unknown>).url).toBe(bucket);
  });

  it("keeps credit and licence with the file, as the page renders them", () => {
    const image = node(LICENSED).image as Record<string, unknown>;

    expect(image.caption).toBe("Song Kang-ho at a press call");
    expect(image.creditText).toBe("Photograph by Someone");
    expect(image.license).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
  });

  /**
   * Search Console reported these three as missing on 2026-08-07. Each is
   * derived from a column the page already prints, so each of them drifting
   * back out is a regression this file should catch rather than Google.
   */
  it("carries all five properties Google's image metadata reads", () => {
    const image = node(LICENSED).image as Record<string, unknown>;

    expect(image.creditText).toBe("Photograph by Someone");
    expect(image.creator).toEqual({ "@type": "Person", name: "Someone" });
    // The holder, not the caption's grammar: "© Photograph by Someone" is not
    // a copyright notice anyone would print.
    expect(image.copyrightNotice).toBe("© Someone");
    expect(image.license).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(image.acquireLicensePage).toBe("https://commons.wikimedia.org/wiki/File:X.jpg");
  });

  it("identifies the hero so the page can point at it instead of copying it", () => {
    const image = node(LICENSED).image as Record<string, unknown>;
    expect(image["@id"]).toBe(
      "http://localhost:3000/blog/song-kang-ho-off-camera#primaryimage",
    );
  });

  it("names a credited body an Organization rather than a person", () => {
    // Commons credits an outfit as readily as a photographer, and plurals are
    // the common case: "Super Festivals", "National Archives", "Ghibli Films".
    for (const credit of [
      "Getty Images",
      "Super Festivals from Ft. Lauderdale, USA",
      "National Archives",
      "Paramount Pictures",
    ]) {
      const image = node({ ...LICENSED, imageCredit: credit }).image as Record<string, unknown>;
      expect((image.creator as { "@type": string })["@type"]).toBe("Organization");
    }
  });

  it("still reads a photographer's name as a person", () => {
    for (const credit of ["Gage Skidmore", "Georges Biard", "Photograph by Sun Ye-jin"]) {
      const image = node({ ...LICENSED, imageCredit: credit }).image as Record<string, unknown>;
      expect((image.creator as { "@type": string })["@type"]).toBe("Person");
    }
  });

  it("credits the channel, not the platform, for a rehosted video frame", () => {
    const image = node({ ...LICENSED, imageCredit: "A24 / YouTube" }).image as Record<
      string,
      unknown
    >;
    expect((image.creator as { name: string }).name).toBe("A24");
    expect(image.creditText).toBe("A24 / YouTube");
  });

  // A © over a work nobody owns is worse than the missing field.
  it("claims no copyright over a public-domain file", () => {
    const image = node({
      ...LICENSED,
      imageLicense: "CC0",
      imageLicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    }).image as Record<string, unknown>;
    expect("copyrightNotice" in image).toBe(false);
    expect(image.creditText).toBe("Photograph by Someone");
  });

  // An operator's own upload states no licence, so it remains a URL rather
  // than becoming a partial ImageObject with fields Search Console will flag.
  it("keeps a file with no licence as a plain URL", () => {
    const image = node({
      image: "/uploads/posts/2026/08/x.webp",
      imageAlt: "The desk's own photograph",
      imageCredit: "CinePixo",
      imageSourceUrl: "https://cinepixo.com/blog/song-kang-ho-off-camera",
    }).image;

    expect(image).toBe("http://localhost:3000/uploads/posts/2026/08/x.webp");
  });

  it("omits `image` entirely with no hero", () => {
    expect("image" in node()).toBe(false);
  });
});

describe("the graph resolves itself", () => {
  it("answers the post's isPartOf with a Blog node in the same document", () => {
    const doc = graph(
      blogNode(),
      postNode(POST, { author: AUTHOR, subjectIds: [peopleEntityId("song-kang-ho")] }),
    ) as unknown as { "@graph": Record<string, unknown>[] };

    const post = doc["@graph"].find((n) => n["@type"] === "BlogPosting")!;
    const ids = new Set(doc["@graph"].map((n) => n["@id"] as string));
    expect(ids.has((post.isPartOf as { "@id": string })["@id"])).toBe(true);
  });

  it("hangs the Blog off the site and its publisher, not off a post", () => {
    const blog = blogNode() as unknown as Record<string, unknown>;
    expect(blog["@id"]).toBe(BLOG_ID);
    expect(blog.url).toBe("http://localhost:3000/blog");
    expect(blog.publisher).toEqual({ "@id": "http://localhost:3000/#organization" });
    expect(blog.isPartOf).toEqual({ "@id": "http://localhost:3000/#website" });
  });
});
