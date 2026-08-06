import { describe, expect, it } from "vitest";
import { postWriteData } from "@/lib/post-write";
import type { PostInput } from "@cinepixo/shared";

/**
 * The `status` / `publishedAt` pairing, which is a CHECK constraint
 * (`Post_published_has_date`) and therefore not a place to improvise.
 *
 * The interesting case is the middle one. Re-saving an already-published post
 * must keep its original date: the piece *was* published then, and restamping it
 * on every typo fix would reorder every shelf and feed on the site and hand the
 * sitemap a `lastmod` that means "someone edited a comma". Getting that wrong is
 * invisible in development — the row saves, the page renders — and shows up as a
 * blog whose archive order drifts.
 */

const INPUT: PostInput = {
  slug: "a-post",
  title: "A Post",
  content: "Body.",
  category: "CRAFT",
  status: "DRAFT",
  tags: [],
  sources: [],
  personIds: [],
  movieIds: [],
};

const ORIGINAL = new Date("2026-08-01T09:00:00.000Z");

describe("postWriteData publication date", () => {
  it("leaves a draft dateless, as the constraint requires", () => {
    expect(postWriteData({ ...INPUT, status: "DRAFT" }, null).publishedAt).toBeNull();
  });

  it("stamps a first publication", () => {
    const at = postWriteData({ ...INPUT, status: "PUBLISHED" }, null).publishedAt;
    expect(at).toBeInstanceOf(Date);
  });

  it("keeps the original date when a published post is re-saved", () => {
    expect(postWriteData({ ...INPUT, status: "PUBLISHED" }, ORIGINAL).publishedAt).toBe(ORIGINAL);
  });

  it("clears the date when a post is pulled back to draft", () => {
    // Not optional: the constraint refuses a DRAFT that still carries one.
    expect(postWriteData({ ...INPUT, status: "DRAFT" }, ORIGINAL).publishedAt).toBeNull();
  });

  it("re-stamps a post that is published, withdrawn, then published again", () => {
    const withdrawn = postWriteData({ ...INPUT, status: "DRAFT" }, ORIGINAL);
    const republished = postWriteData({ ...INPUT, status: "PUBLISHED" }, withdrawn.publishedAt);
    expect(republished.publishedAt).toBeInstanceOf(Date);
    expect(republished.publishedAt).not.toBe(ORIGINAL);
  });
});

describe("postWriteData optional columns", () => {
  it("writes null rather than undefined for every absent field", () => {
    // Prisma treats `undefined` as "leave this column alone", so an editor
    // clearing the standfirst or removing the hero would silently keep the old
    // value on an update. Null is the only spelling that erases.
    const data = postWriteData(INPUT, null);
    for (const key of [
      "dek",
      "image",
      "imageAlt",
      "imageCredit",
      "imageLicense",
      "imageLicenseUrl",
      "imageSourceUrl",
    ] as const) {
      expect(data[key]).toBeNull();
    }
  });

  it("passes the arrays through as arrays, never undefined", () => {
    const data = postWriteData({ ...INPUT, tags: ["a"], sources: ["https://x.test/y"] }, null);
    expect(data.tags).toEqual(["a"]);
    expect(data.sources).toEqual(["https://x.test/y"]);
  });
});
