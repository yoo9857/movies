import { describe, expect, it } from "vitest";
import { exportMarkdownBody, personToMarkdown } from "@/lib/markdown-export";
import { plainText } from "@/lib/seo";

/**
 * What leaves this origin: feed.xml's content:encoded, the .md endpoints and
 * llms-full.txt all ship the review body to consumers that have no idea what a
 * `:::still` is and no origin to resolve `/uploads/…` against.
 */

describe("exportMarkdownBody", () => {
  it("absolutises uploaded images and internal links", () => {
    const out = exportMarkdownBody("![a](/uploads/reviews/2026/07/x.webp) and [the film](/movies/abc)");
    expect(out).toContain("](http://localhost:3000/uploads/reviews/2026/07/x.webp)");
    expect(out).toContain("](http://localhost:3000/movies/abc)");
    expect(out).not.toContain("](/uploads");
  });

  it("leaves absolute and protocol-relative URLs alone", () => {
    const src = "[x](https://example.com/a) ![y](//cdn.example.com/b.png)";
    expect(exportMarkdownBody(src)).toBe(src);
  });

  it("translates a spoiler fence into a warning and keeps the text", () => {
    const out = exportMarkdownBody(":::spoiler\nthe basement reveal\n:::\nafter");
    expect(out).toContain("**[Spoilers follow.]**");
    expect(out).toContain("the basement reveal");
    expect(out).toContain("after");
    expect(out).not.toContain(":::");
  });

  it("drops trailer and still placeholders, which point at page-only media", () => {
    const out = exportMarkdownBody("before\n:::trailer\nmiddle\n:::still 2\nafter");
    expect(out).not.toContain(":::");
    expect(out).toContain("before");
    expect(out).toContain("middle");
    expect(out).toContain("after");
  });

  it("passes ordinary markdown through byte-for-byte", () => {
    const src = "## Heading\n\n**기생충!**은 걸작. `code` and > quote\n";
    expect(exportMarkdownBody(src)).toBe(src);
  });
});

describe("personToMarkdown", () => {
  const person = {
    slug: "damien-chazelle",
    name: "Damien Chazelle",
    bio: "Our own words about him.",
    notes: "Watch Whiplash first.",
    birthDate: new Date("1985-01-19"),
    deathDate: null,
    birthPlace: "Providence",
    occupations: ["film director", "screenwriter"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Damien_Chazelle",
    wikidataId: "Q18350026",
    imdbId: "nm3227090",
    updatedAt: new Date("2026-07-30"),
    films: [
      {
        slug: "whiplash-2014",
        title: "Whiplash",
        year: 2014,
        roles: ["Director", "Screenplay"],
        average: 9,
        reviewCount: 2,
      },
      {
        slug: "la-la-land-2016",
        title: "La La Land",
        year: 2016,
        roles: ["Director"],
        average: null,
        reviewCount: 0,
      },
    ],
    reviews: [
      {
        slug: "whiplash-tempo",
        title: "Not Quite My Tempo",
        rating: 9,
        filmTitle: "Whiplash",
        publishedAt: new Date("2026-07-01"),
        author: { username: "devoh", displayName: null },
      },
    ],
  };

  it("leads with the attribution facts and their provenance", () => {
    const md = personToMarkdown(person);
    expect(md).toContain("type: 'person'");
    expect(md).toContain("born: '1985-01-19'");
    expect(md).toContain("wikidata: 'Q18350026'");
    expect(md).toContain("imdb: 'https://www.imdb.com/name/nm3227090/'");
    expect(md).toContain("canonical: 'http://localhost:3000/people/damien-chazelle'");
  });

  it("carries this site's numbers and links the entities", () => {
    const md = personToMarkdown(person);
    // Weighted by reviews: (9 × 2) / 2 = 9.00.
    expect(md).toContain("fandom_rating: '9.00/10 across 2 reviews'");
    expect(md).toContain("[Whiplash](http://localhost:3000/movies/whiplash-2014)");
    expect(md).toContain("**9.0/10**");
    expect(md).toContain("[Not Quite My Tempo](http://localhost:3000/reviews/whiplash-tempo)");
  });

  it("lists an unreviewed film rather than dropping it", () => {
    expect(personToMarkdown(person)).toContain("La La Land");
    expect(personToMarkdown(person)).toContain("unreviewed here");
  });

  it("keeps our prose sections in our voice", () => {
    const md = personToMarkdown(person);
    expect(md).toContain("Our own words about him.");
    expect(md).toContain("## Notes from the fandom");
    expect(md).toContain("Watch Whiplash first.");
  });
});

describe("plainText and authoring directives", () => {
  it("drops ::: lines from summaries instead of quoting them", () => {
    const out = plainText(":::spoiler\nhidden text\n:::\n\nThe real prose.");
    expect(out).not.toContain(":::");
    expect(out).toContain("The real prose.");
  });

  it("still strips images and unwraps links", () => {
    const out = plainText("![poster](/uploads/x.webp) see [the film](/movies/1)");
    expect(out).not.toContain("uploads");
    expect(out).toContain("see the film");
  });
});
