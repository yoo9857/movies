import { describe, expect, it } from "vitest";
import {
  eventKey,
  licenceAllows,
  looksArchival,
  looksLikePlace,
  nameMatches,
  photoAlt,
  photoPlan,
  pickPhotos,
  rhythmCapacity,
  unwrapRedirect,
  type Photo,
} from "@/lib/gather-sources";
import { plainText } from "@/lib/seo";

const photo = (title: string, day: string): Photo => ({
  title,
  day,
  url: `https://upload.example/${title}.jpg`,
  width: 1600,
  height: 1067,
  credit: "Someone",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  sourceUrl: `https://commons.example/${title}`,
  description: null,
});

describe("photoPlan", () => {
  const headings = ["Opening", "Second", "Third", "Fourth", "Fifth"];

  it("runs 1 / 2 / 2 / 1 down the piece and leaves the opening clear", () => {
    expect(photoPlan(headings, 6)).toEqual([
      { at: "Second", take: 1 },
      { at: "Third", take: 2 },
      { at: "Fourth", take: 2 },
      { at: "Fifth", take: 1 },
    ]);
  });

  it("stops when the pictures run out rather than inventing rows", () => {
    expect(photoPlan(headings, 3)).toEqual([
      { at: "Second", take: 1 },
      { at: "Third", take: 2 },
    ]);
  });

  it("never drops a picture that was already fetched", () => {
    const plan = photoPlan(["A", "B", "C"], 9);
    expect(plan.reduce((n, r) => n + r.take, 0)).toBe(9);
  });

  it("uses the only heading there is, and puts every picture in that one row", () => {
    // The no-dropping rule wins over the rhythm when there is nowhere else to
    // put them: a picture fetched and then silently discarded is the worse bug.
    expect(photoPlan(["Only"], 2)).toEqual([{ at: "Only", take: 2 }]);
  });

  it("has nothing to say about a piece with no pictures or no headings", () => {
    expect(photoPlan(headings, 0)).toEqual([]);
    expect(photoPlan([], 4)).toEqual([]);
  });
});

/**
 * The alt text a piece shipped with: "Catherine Laga'aia (55221039143)" — the
 * subject's name and a Flickr upload id, non-blank enough to satisfy
 * `Post_image_needs_alt` and useless to the reader it exists for.
 */
describe("photoAlt", () => {
  const commons =
    "Catherine Laga'aia on the red carpet at the Big Screen Achievement Awards at the 2026 CinemaCon in Las Vegas, Nevada. Please attribute to Gage Skidmore if used elsewhere.";

  it("says what the picture shows instead of naming the file", () => {
    const alt = photoAlt(commons, "Catherine Laga'aia (55221039143)");
    expect(alt).toContain("red carpet");
    expect(alt).not.toContain("55221039143");
  });

  it("drops the uploader's licence instruction, which is not a description", () => {
    const alt = photoAlt(commons, "Catherine Laga'aia (55221039143)");
    expect(alt).not.toMatch(/please attribute/i);
    expect(alt).not.toMatch(/Gage Skidmore/);
    expect(alt.endsWith("Nevada.")).toBe(true);
  });

  it("prefers the title when the description names nobody", () => {
    // Both shipped in a draft: a photograph of Steve Buscemi described only by
    // the premiere he was at, and one of John Malkovich described as "the
    // actor". Alt text that names no one is the failure the constraint exists
    // to prevent, and here the filename was the thing that named them.
    expect(
      photoAlt(
        'Premiere of "The Only Living Pickpocket in New York"',
        "Steve Buscemi at the Sundance Film Festival",
        "Steve Buscemi",
      ),
    ).toBe("Steve Buscemi at the Sundance Film Festival");
    expect(photoAlt("the actor", "John malkovich en el teatro colon", "John Malkovich")).toBe(
      "John malkovich en el teatro colon",
    );
  });

  it("keeps the description when it does name the subject", () => {
    expect(
      photoAlt("Steve Buscemi at the Off-Broadway opening night.", "SteveBuscemi-byPhilipRomano", "Steve Buscemi"),
    ).toBe("Steve Buscemi at the Off-Broadway opening night.");
  });

  it("keeps the description when neither it nor the title names anyone", () => {
    // Losing the more informative of two anonymous captions helps no one.
    expect(photoAlt("Two people on a red carpet.", "DSC_0431", "Steve Buscemi")).toBe(
      "Two people on a red carpet.",
    );
  });

  it("refuses a description of the file, which is how a filename became alt text", () => {
    // Published, on a piece about Johnny Depp. The description named him, so it
    // won on `nameMatches`, and the reader who needed the caption was told the
    // name of a crop.
    expect(
      photoAlt("A cropped version of File:Johnny Depp (3).jpg", "Johnny Depp (3)", "Johnny Depp"),
    ).toBe("Johnny Depp (3)");
    // Each branch of the pattern, because the first version of it shipped with
    // two dead ones: both word boundaries went into the source as literal
    // backspace bytes, which no title contains, and the two live branches were
    // enough to make the assertions above pass.
    expect(photoAlt("File:Bong Joon-ho at Cannes.jpg", "Bong Joon-ho 2019", "Bong Joon-ho")).toBe(
      "Bong Joon-ho 2019",
    );
    expect(photoAlt("Bong Joon-ho 2019 portrait.jpeg", "Bong Joon-ho 2019", "Bong Joon-ho")).toBe(
      "Bong Joon-ho 2019",
    );
    expect(
      photoAlt("Derivative work of an earlier upload.", "Bong Joon-ho 2019", "Bong Joon-ho"),
    ).toBe("Bong Joon-ho 2019");
    // Sentence by sentence, like the licence instructions: the note about the
    // upload goes and the description of the photograph stays.
    expect(
      photoAlt(
        "Bong Joon-ho at the Cannes press conference. Cropped from File:Bong.jpg.",
        "Bong Joon-ho 2019",
        "Bong Joon-ho",
      ),
    ).toBe("Bong Joon-ho at the Cannes press conference.");
  });

  it("falls back to the title when the file describes nothing", () => {
    expect(photoAlt(null, "Dwayne_Johnson-1690")).toBe("Dwayne Johnson-1690");
    expect(photoAlt("   ", "Dwayne Johnson-1690")).toBe("Dwayne Johnson-1690");
    // A description that is *only* an instruction leaves nothing behind.
    expect(photoAlt("Please attribute to X if used elsewhere.", "A title")).toBe("A title");
  });
});

/**
 * The near-miss: a gather for the director Martin McDonagh ranked first on a
 * scanned naturalisation index card for a different man of a similar name.
 * Public domain, high resolution, newest by capture date — and one step from
 * being the hero photograph of a piece about a living film-maker.
 */
describe("archival paper is not a photograph of anyone", () => {
  const NAME = "Martin McDonagh";
  const CARD = "McDonagh, Michael Martin - Born- (BLANK), Naturalized- (BLANK)";

  it("still reads the name off the card, which is why the title filter has to catch it", () => {
    expect(nameMatches(NAME, CARD)).toBe(true);
    expect(looksArchival(CARD)).toBe(true);
  });

  it("refuses the other genealogical series that carry people's names", () => {
    for (const title of [
      "Petition for Naturalization of Jan Novak",
      "1911 census return, Dublin",
      "Passenger list of the SS Baltic",
      "World War II draft card - Smith, John",
      "Headstone of Someone Famous",
    ]) {
      expect(looksArchival(title)).toBe(true);
    }
  });

  it("keeps real photographs, including ones whose words merely sound archival", () => {
    for (const title of [
      "Martin McDonagh at 2012 Toronto International Film Festival",
      "Martin McDonagh 2012",
      "Martin McDonagh at the Banshees premiere",
      // "record" alone would refuse this, which is why the pattern names series.
      "A record shop in Galway",
      "Actor holding a birth announcement",
    ]) {
      expect(looksArchival(title)).toBe(false);
    }
    expect(nameMatches(NAME, "Martin McDonagh at the Banshees premiere")).toBe(true);
  });
});

/**
 * The one that got published: a gather for Denis Villeneuve returned a
 * cemetery in the French commune of Villeneuve-Saint-Denis, which carries
 * both of his tokens in the wrong order. `nameMatches` cannot see it — the
 * McDonagh card above pins that it deliberately ignores order — so the title
 * filter has to, exactly as it does for archival paper.
 */
describe("a place named after someone is not a photograph of them", () => {
  it("refuses the toponym that reads as the name", () => {
    for (const title of [
      "Cimetière - Villeneuve-Saint-Denis (FR77) - 2025-08-01 - 1",
      "Cemetery of Villeneuve-Saint-Denis",
      "Monument to Charlie Chaplin in Vevey",
      "Memorial to Satyajit Ray",
      "Rue Jean Renoir street sign",
    ]) {
      expect(looksLikePlace(title)).toBe(true);
    }
    // Both tokens are there, in the wrong order — which is the whole problem.
    expect(nameMatches("Denis Villeneuve", "Cimetière - Villeneuve-Saint-Denis (FR77)")).toBe(true);
  });

  it("keeps photographs of people, including ones taken at a place", () => {
    for (const title of [
      "Denis Villeneuve March 2026 Dune Trailer Launch 3",
      "Bong Joon-ho at the Église Saint-Sulpice memorial service",
      "Anne Hathaway arrives at Grand Central Station",
      "Park Chan-wook at a school screening in Busan",
      "Christopher Nolan at the NYC Premiere of The Odyssey",
    ]) {
      expect(looksLikePlace(title)).toBe(false);
    }
  });
});

/**
 * The layout this exists to hold: a generous gather used to hand `photoPlan`
 * twelve pictures for four headings and get 1 / 2 / 2 / 7 — the overflow
 * stacked under the last heading, which is exactly what the rhythm is for.
 */
describe("rhythmCapacity", () => {
  const five = ["Open", "Two", "Three", "Four", "Five"];

  it("is what the rhythm lays against the headings after the first", () => {
    expect(rhythmCapacity(five)).toBe(6); // 1 + 2 + 2 + 1 over four targets
    expect(photoPlan(five, rhythmCapacity(five)).map((r) => r.take)).toEqual([1, 2, 2, 1]);
  });

  it("keeps the rhythm intact for any heading count", () => {
    for (let n = 2; n <= 9; n++) {
      const headings = Array.from({ length: n }, (_, i) => "H" + i);
      const plan = photoPlan(headings, rhythmCapacity(headings));
      // No row ever exceeds the rhythm's own largest step.
      expect(Math.max(...plan.map((r) => r.take))).toBeLessThanOrEqual(2);
    }
  });

  it("has no capacity for a piece with no headings", () => {
    expect(rhythmCapacity([])).toBe(0);
    expect(photoPlan([], rhythmCapacity([]))).toEqual([]);
  });
});

describe("pickPhotos", () => {
  it("takes the newest first", () => {
    const picked = pickPhotos([photo("old", "2020-01-01"), photo("new", "2026-07-14")], 1);
    expect(picked[0].title).toBe("new");
  });

  it("caps one event at two frames so a gallery is not one red carpet", () => {
    const same = ["Premiere 1", "Premiere 2", "Premiere 3", "Premiere 4"].map((t) =>
      photo(t, "2026-07-14"),
    );
    const picked = pickPhotos([...same, photo("Elsewhere", "2024-01-01")], 4);
    expect(picked.filter((p) => p.title.startsWith("Premiere"))).toHaveLength(2);
    expect(picked.map((p) => p.title)).toContain("Elsewhere");
  });

  it("reads a trailing frame number as the same occasion, bracketed or not", () => {
    expect(eventKey("V at a show 03")).toBe(eventKey("V at a show 07"));
    expect(eventKey("V at a show (1)")).toBe(eventKey("V at a show (2)"));
    expect(eventKey("A different show 01")).not.toBe(eventKey("V at a show 01"));
  });

  it("folds a Commons crop into the photograph it was cropped from", () => {
    expect(eventKey("Dwayne Johnson-1764 (cropped)")).toBe(eventKey("Dwayne Johnson-1764"));
    expect(eventKey("Dwayne Johnson-1764 (cropped over the top)")).toBe(
      eventKey("Dwayne Johnson-1690"),
    );
    // A parenthetical that is not a crop still names its own occasion.
    expect(eventKey("V at a show (Berlin)")).not.toBe(eventKey("V at a show (Cannes)"));
  });

  it("does not offer one photograph three times because two of them are crops", () => {
    const shoot = [
      "Dwayne Johnson-1690",
      "Dwayne Johnson-1764",
      "Dwayne Johnson-1764 (cropped)",
      "Dwayne Johnson-1764 (cropped over the top)",
    ].map((t) => photo(t, "2025-09-01"));
    const picked = pickPhotos([...shoot, photo("Dwayne johnson (53544402096)", "2024-02-21")], 6);
    expect(picked.filter((p) => p.title.startsWith("Dwayne Johnson-"))).toHaveLength(2);
    expect(picked.map((p) => p.title)).toContain("Dwayne johnson (53544402096)");
  });
});

describe("photo credits never reach a summary", () => {
  // A credit line survived plainText as "Photo: Someone · CC BY-SA 4.0 ·
  // source" — the attribution stripped of the URL that makes it checkable, and
  // the opening sentence of any dek-less post that starts on a picture.
  it("drops the credit paragraph rather than flattening its links", () => {
    const md = [
      "![a](https://x.test/a.webp)",
      "",
      "*Photo: PhilipRomano · [CC BY-SA 4.0](https://cc.test) · [source](https://commons.test)*",
      "",
      "The piece begins here.",
    ].join("\n");
    const text = plainText(md);
    expect(text).toBe("The piece begins here.");
    expect(text).not.toContain("source");
    expect(text).not.toContain("PhilipRomano");
  });

  it("drops the plural form a two-up row writes", () => {
    expect(plainText("*Photos: Someone · CC BY 4.0*\n\nBody.")).toBe("Body.");
  });

  it("leaves the author's own italics alone", () => {
    expect(plainText("*This is emphasis the writer meant.*")).toBe(
      "This is emphasis the writer meant.",
    );
  });
});

/**
 * Two clauses this site cannot honour, and used to accept anyway: the
 * gatherers required a licence to have a *name*, not to permit anything.
 */
describe("licenceAllows", () => {
  it("takes the licences we can actually use", () => {
    for (const l of ["CC0", "Public domain", "CC BY 4.0", "CC BY-SA 3.0", "No restrictions"]) {
      expect(licenceAllows(l), l).toBe(true);
    }
  });

  it("refuses NonCommercial — this site carries advertising", () => {
    for (const l of ["CC BY-NC 4.0", "CC BY-NC-SA 3.0", "CC NonCommercial"]) {
      expect(licenceAllows(l), l).toBe(false);
    }
  });

  it("refuses NoDerivatives — every file here is re-encoded", () => {
    for (const l of ["CC BY-ND 4.0", "CC BY-NC-ND 4.0"]) {
      expect(licenceAllows(l), l).toBe(false);
    }
  });

  it("refuses anything it does not recognise rather than guessing", () => {
    expect(licenceAllows("All rights reserved")).toBe(false);
    expect(licenceAllows("")).toBe(false);
  });
});

describe("nameMatches", () => {
  it("needs every token of the name, so a namesake does not slip through", () => {
    expect(nameMatches("Keigo Higashino", "Keigo Higashino at a signing")).toBe(true);
    // The failure this exists for: a search for a novelist returning a railway
    // station of the same name, correctly licensed and completely wrong.
    expect(nameMatches("Keigo Higashino", "Higashino Station platform 2")).toBe(false);
  });

  it("ignores case, punctuation and accents", () => {
    expect(nameMatches("Anne Hathaway", "ANNE HATHAWAY, 2026 — premiere")).toBe(true);
    expect(nameMatches("Léa Seydoux", "Lea Seydoux at Cannes")).toBe(true);
  });

  it("keeps two-character Hangul tokens, which are whole names", () => {
    expect(nameMatches("송강호", "배우 송강호 2026")).toBe(true);
    expect(nameMatches("송강호", "부산국제영화제 개막식")).toBe(false);
  });
});

describe("pickPhotos ranking", () => {
  it("prefers a press photograph over a snapshot from the same day", () => {
    const snap = photo("A quiet snapshot", "2026-01-01");
    const press = photo("At the London premiere", "2026-01-01");
    expect(pickPhotos([snap, press], 1)[0].title).toBe("At the London premiere");
  });

  it("still takes the newer picture over the better-staged older one", () => {
    const old = photo("At the London premiere", "2020-01-01");
    const recent = photo("A quiet snapshot", "2026-01-01");
    expect(pickPhotos([old, recent], 1)[0].title).toBe("A quiet snapshot");
  });

  it("drops what is not of the subject when a subject is named", () => {
    const right = photo("Anne Hathaway at a premiere", "2026-01-01");
    const wrong = photo("Hathaway House, Warwickshire", "2026-02-01");
    const picked = pickPhotos([wrong, right], 5, "Anne Hathaway");
    expect(picked).toHaveLength(1);
    expect(picked[0].title).toBe("Anne Hathaway at a premiere");
  });
});

describe("unwrapRedirect", () => {
  it("pulls the publisher's URL out of a Bing redirect", () => {
    expect(
      unwrapRedirect("https://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fvariety.com%2Fa"),
    ).toBe("https://variety.com/a");
  });

  it("leaves a direct link alone", () => {
    expect(unwrapRedirect("https://variety.com/a")).toBe("https://variety.com/a");
    expect(unwrapRedirect("not a url")).toBe("not a url");
  });
});
