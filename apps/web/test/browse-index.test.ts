import { describe, expect, it } from "vitest";
import { movieBrowseIsIndexable, peopleBrowseIsIndexable } from "@/lib/browse-index";

/**
 * The failure this pins: every browse state on the site answered 200 with
 * `index, follow` and a self-canonical, so the film library's 18 genres × 13
 * decades × up to 500 pages — plus the people directory's 8 departments × 27
 * initials — were all offered to crawlers as destinations. Tens of thousands of
 * URLs holding thirty rows of a Wikidata import apiece, against seventy pages
 * of writing. The individual film and person pages had been `noindex` since the
 * bulk import landed; the listings that enumerate them had been missed.
 *
 * Both directions are pinned deliberately. Over-correcting is the other
 * regression: mark the facet fronts `noindex` too and the library loses the
 * thirty-two entry points the sitemap submits, which is a traffic loss that
 * looks like nothing from the inside.
 */
describe("movieBrowseIsIndexable", () => {
  it("offers exactly the states the sitemap submits", () => {
    // The unfiltered front.
    expect(movieBrowseIsIndexable("", null, 1)).toBe(true);
    // One facet deep, either axis — "westerns", "films from the 1990s".
    expect(movieBrowseIsIndexable("Western", null, 1)).toBe(true);
    expect(movieBrowseIsIndexable("Science Fiction", null, 1)).toBe(true);
    expect(movieBrowseIsIndexable("", 1990, 1)).toBe(true);
    expect(movieBrowseIsIndexable("", 1900, 1)).toBe(true);
  });

  it("keeps pagination out of the index on every facet", () => {
    expect(movieBrowseIsIndexable("", null, 2)).toBe(false);
    expect(movieBrowseIsIndexable("", null, 500)).toBe(false);
    expect(movieBrowseIsIndexable("Drama", null, 2)).toBe(false);
    expect(movieBrowseIsIndexable("", 1990, 77)).toBe(false);
  });

  it("keeps the 234 genre×decade cross-sections out, page one included", () => {
    expect(movieBrowseIsIndexable("Drama", 1990, 1)).toBe(false);
    expect(movieBrowseIsIndexable("Horror", 1980, 1)).toBe(false);
    expect(movieBrowseIsIndexable("Drama", 1990, 3)).toBe(false);
  });

  it("treats decade 0 as a selected decade, not as absent", () => {
    // `if (decade)` would read 0 as no decade and index the cross-section. The
    // library has no year-0 films, but the guard is a `!= null` for a reason and
    // a later refactor should not be free to loosen it.
    expect(movieBrowseIsIndexable("Drama", 0, 1)).toBe(false);
    expect(movieBrowseIsIndexable("", 0, 1)).toBe(true);
  });
});

describe("peopleBrowseIsIndexable", () => {
  it("offers only the bare listing", () => {
    expect(peopleBrowseIsIndexable(null, null)).toBe(true);
  });

  it("keeps role and alphabet slices out of the index", () => {
    expect(peopleBrowseIsIndexable("Acting", null)).toBe(false);
    expect(peopleBrowseIsIndexable("Director", null)).toBe(false);
    expect(peopleBrowseIsIndexable(null, "A")).toBe(false);
    expect(peopleBrowseIsIndexable(null, "#")).toBe(false);
    expect(peopleBrowseIsIndexable("Acting", "K")).toBe(false);
  });

  it("reads an empty string as no selection, the way the page passes it", () => {
    expect(peopleBrowseIsIndexable("", "")).toBe(true);
  });
});
