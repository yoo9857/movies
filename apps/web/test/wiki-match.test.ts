import { describe, expect, it } from "vitest";
import { foldName } from "@/lib/monogram";

/**
 * The rule that decides whether a Wikipedia article is defensibly the same
 * person, tested against the failure this codebase already shipped once.
 *
 * The seeded cast photos were "verified" by checking that the URL returned an
 * image — which is how a photograph of a stranger ended up on Michael Caine's
 * card. Taking the top search result would be the same mistake with a different
 * source, so the matcher has to reject confidently.
 *
 * The rule lives in the enrich-all route; it is duplicated here rather than
 * exported because a route module pulls in prisma and the image pipeline, and a
 * pure decision is worth testing without a database.
 */

const FILM_WORDS = [
  "actor", "actress", "film", "director", "filmmaker", "screenwriter",
  "cinematographer", "producer", "composer", "editor", "animator",
  "voice", "writer", "playwright", "novelist",
];

function accepts(name: string, candidate: { title: string; description: string | null }): boolean {
  const wanted = foldName(name);
  const got = foldName(candidate.title);
  const withoutParenthetical = foldName(candidate.title.replace(/\s*\([^)]*\)\s*$/, ""));
  if (got !== wanted && withoutParenthetical !== wanted) return false;
  if (!candidate.description) return false;
  return FILM_WORDS.some((w) => candidate.description!.toLowerCase().includes(w));
}

describe("accepts a defensible match", () => {
  it("takes an exact title with a film description", () => {
    expect(
      accepts("Damien Chazelle", {
        title: "Damien Chazelle",
        description: "American and French filmmaker (born 1985)",
      }),
    ).toBe(true);
  });

  it("takes a parenthetical disambiguator", () => {
    expect(
      accepts("Michael Caine", {
        title: "Michael Caine (actor)",
        description: "English actor (born 1933)",
      }),
    ).toBe(true);
  });

  it("matches a letter NFKD cannot decompose", () => {
    // The real refusal from the first production run: the article spells his
    // name with l-stroke, which survives NFKD and was then stripped as
    // punctuation, so "Andrzej Sekula" did not equal "Andrzej Sekula".
    expect(
      accepts("Andrzej Sekula", {
        title: `Andrzej Seku${String.fromCodePoint(0x0142)}a`,
        description: "Polish cinematographer",
      }),
    ).toBe(true);
    expect(foldName(`Seku${String.fromCodePoint(0x0142)}a`)).toBe("sekula");
    expect(foldName(`Bj${String.fromCodePoint(0x00f8)}rk`)).toBe("bjork");
  });

  it("ignores case, accents and punctuation in the name", () => {
    expect(
      accepts("Bong Joon-ho", {
        title: "Bong Joon Ho",
        description: "South Korean film director (born 1969)",
      }),
    ).toBe(true);
    expect(
      accepts("Amelie Poulain", {
        title: "Amélie Poulain",
        description: "fictional film character",
      }),
    ).toBe(true);
  });
});

describe("refuses anything it cannot defend", () => {
  it("refuses a different person with a similar name", () => {
    // The failure that put a stranger's face on a card.
    expect(
      accepts("Michael Caine", {
        title: "Michael Caine (businessman)",
        description: "British businessman",
      }),
    ).toBe(false);
  });

  it("refuses a namesake in another field", () => {
    expect(
      accepts("Michael Jordan", {
        title: "Michael Jordan",
        description: "American basketball player (born 1963)",
      }),
    ).toBe(false);
  });

  it("refuses an article that is merely related", () => {
    expect(
      accepts("Christopher Nolan", {
        title: "Christopher Nolan filmography",
        description: "list of films",
      }),
    ).toBe(false);
  });

  it("refuses a partial-name match", () => {
    expect(
      accepts("Bong Joon-ho", {
        title: "Bong Joon-ho's unrealized projects",
        description: "film projects",
      }),
    ).toBe(false);
  });

  it("refuses when there is no description to judge", () => {
    expect(accepts("Damien Chazelle", { title: "Damien Chazelle", description: null })).toBe(false);
  });

  it("refuses a description with no film connection", () => {
    expect(
      accepts("Anne Hathaway", {
        title: "Anne Hathaway",
        description: "wife of William Shakespeare",
      }),
    ).toBe(false);
  });
});
