import { describe, expect, it } from "vitest";
import {
  DUPLICATE_OVERLAP,
  isNearDuplicate,
  nameCandidates,
  namedInProse,
  normalizeUrl,
  overlapRatio,
  pickSpread,
  storyQuery,
  titleCandidates,
  titleTokens,
  type Candidate,
} from "@/lib/news-lane";

describe("normalizeUrl", () => {
  it("reduces a link to the article it identifies", () => {
    expect(normalizeUrl("https://www.variety.com/2026/film/news/x-1236839543/?utm_source=rss")).toBe(
      "variety.com/2026/film/news/x-1236839543",
    );
    // The same piece, linked two ways — which is what the duplicate gate reads.
    expect(normalizeUrl("http://variety.com/2026/film/news/x-1236839543")).toBe(
      normalizeUrl("https://www.variety.com/2026/film/news/x-1236839543/"),
    );
  });

  it("does not throw on whatever a feed hands it", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});

describe("the duplicate gate", () => {
  /** Both of these ran on the site; a lane must not offer the second again. */
  const LIVE = [
    titleTokens("Inside Spider-Man: Brand New Day’s $1.67 Billion Ten-Day Box Office Run"),
    titleTokens("Korea’s 150-Day Movie Window Puts the Audience Last"),
  ];

  it("catches the same story told at a different length", () => {
    expect(isNearDuplicate("Spider-Man Brand New Day Box Office Run Passes Records", LIVE)).toBe(true);
    expect(isNearDuplicate("Korea's 150-day movie window: the audience comes last", LIVE)).toBe(true);
  });

  it("lets a different story through, including one on the same beat", () => {
    expect(isNearDuplicate("Insidious: Out of the Further Opens to $25 Million", LIVE)).toBe(false);
    expect(isNearDuplicate("Japan Sets Its Own Theatrical Window Rules", LIVE)).toBe(false);
  });

  it("scores containment, not symmetry — the long headline is still the same story", () => {
    const short = titleTokens("Venice puts one woman in competition");
    const long = titleTokens(
      "Venice Put One Woman in Competition. Its Own Horizons Lineup Says That Was a Choice",
    );
    expect(overlapRatio(short, long)).toBeGreaterThanOrEqual(DUPLICATE_OVERLAP);
  });

  it("ignores filler, so two headlines do not match on 'the' and 'of'", () => {
    expect(titleTokens("The end of the road for a star")).not.toContain("the");
    expect(overlapRatio(titleTokens("The end of the war"), titleTokens("The end of the day"))).toBeLessThan(
      DUPLICATE_OVERLAP,
    );
  });
});

describe("nameCandidates", () => {
  it("offers the runs a name could be, whatever the headline's case", () => {
    // Title Case: capitalisation carries no signal, so every run is a candidate.
    expect(nameCandidates("Lee Chang-dong Returns to Venice After 24 Years")).toContain("Lee Chang dong");
    expect(nameCandidates("early imax 70mm dune showings nearly sell out")).toContain("dune showings");
  });

  it("does not start or end a name on filler", () => {
    const runs = nameCandidates("Anne Hathaway and the Odyssey");
    expect(runs).toContain("Anne Hathaway");
    expect(runs.some((r) => r.startsWith("and ") || r.endsWith(" the"))).toBe(false);
  });

  it("refuses runs that are figures rather than words", () => {
    expect(nameCandidates("Spider-Man Passes $1.67 Billion")).not.toContain("$1.67 Billion");
  });
});

describe("storyQuery", () => {
  it("drops the outlet's subtitle, which is what made a story look uncovered", () => {
    // Whole, this headline found two outlets; trimmed, it finds the story.
    expect(storyQuery("Marvel's X-Men Movie Cast Explained: Where You've Seen The Actors Before")).toBe(
      "Marvel's X-Men Movie Cast Explained",
    );
    expect(
      storyQuery("The Sound of ‘The Odyssey’: Composer Ludwig Göransson Used Ancient Greek Instruments"),
    ).toBe("The Sound of The Odyssey");
  });

  it("keeps the whole headline when the first clause is not the subject", () => {
    expect(storyQuery("EXCLUSIVE: The Last House director talks filming Netflix's new sci-fi")).toBe(
      "EXCLUSIVE The Last House director talks filming Netflix's new",
    );
  });

  it("caps the query, because nine words already name a story", () => {
    expect(
      storyQuery("Lawmakers Offer Film Industry a Fix on California Tax Credit Cap Before Recess"),
    ).toBe("Lawmakers Offer Film Industry a Fix on California Tax");
  });
});

describe("titleCandidates", () => {
  it("lets a title begin on an article, which a name may not", () => {
    // `nameCandidates` throws this away, and the piece linked no film at all.
    expect(titleCandidates("Ludwig Göransson Scored The Odyssey").grams).toContain("The Odyssey");
  });

  it("offers the one-word title a name-shaped run cannot reach", () => {
    expect(titleCandidates("Sinners Cinematographer Wins an Oscar").single).toContain("Sinners");
  });

  it("keeps filler and figures out of the one-word candidates", () => {
    const { single } = titleCandidates("The Odyssey passes $1.6 billion with 5 records");
    expect(single).not.toContain("The");
    expect(single).not.toContain("$1.6");
    expect(single).not.toContain("5");
  });
});

describe("namedInProse", () => {
  const PROSE = "Yeon Sang-ho's Colony reached TVOD two months after opening. Nolan said little.";

  it("accepts a subject the piece names, in full or by surname", () => {
    expect(namedInProse("Yeon Sang-ho", PROSE)).toBe(true);
    expect(namedInProse("Christopher Nolan", PROSE)).toBe(true);
  });

  /**
   * The 2026-08-21 failure exactly: the piece went out under a photograph of
   * Jun Ji-hyun and linked her, and never mentioned her once.
   */
  it("refuses a subject the piece never names", () => {
    expect(namedInProse("Jun Ji-hyun", PROSE)).toBe(false);
  });
});

describe("pickSpread", () => {
  const candidate = (category: Candidate["category"], date: string, topic: string): Candidate => ({
    category,
    date,
    topic,
    urls: [`https://example.test/${topic}`],
  });

  it("takes from every shelf before taking a second from any", () => {
    const picked = pickSpread(
      [
        candidate("INDUSTRY", "2026-08-21", "box office one"),
        candidate("INDUSTRY", "2026-08-21", "box office two"),
        candidate("INDUSTRY", "2026-08-20", "box office three"),
        candidate("CRAFT", "2026-08-19", "a cinematographer"),
        candidate("PEOPLE", "2026-08-18", "a director"),
      ],
      3,
    );
    expect(new Set(picked.map((p) => p.category)).size).toBe(3);
  });

  it("falls back to a busy shelf rather than returning short", () => {
    const picked = pickSpread(
      [
        candidate("INDUSTRY", "2026-08-21", "one"),
        candidate("INDUSTRY", "2026-08-20", "two"),
        candidate("INDUSTRY", "2026-08-19", "three"),
      ],
      3,
    );
    expect(picked).toHaveLength(3);
  });

  it("prefers the fresher story within a shelf", () => {
    const picked = pickSpread(
      [
        candidate("CRAFT", "2026-08-01", "older"),
        candidate("CRAFT", "2026-08-21", "newer"),
      ],
      1,
    );
    expect(picked[0].topic).toBe("newer");
  });
});
