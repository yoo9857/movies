import { describe, expect, it } from "vitest";
import {
  exportMarkdownBody,
  markdownResponse,
  movieToMarkdown,
  personToMarkdown,
  topicToMarkdown,
} from "@/lib/markdown-export";
import { plainText } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

/**
 * What leaves this origin: feed.xml's content:encoded, the .md endpoints and
 * llms-full.txt all ship the review body to consumers that have no idea what a
 * `:::still` is and no origin to resolve `/uploads/…` against.
 */

/**
 * Every review, film, person and topic is crawlable at two URLs — the page and
 * its `.md` rendition — with the same text. Markdown cannot carry a
 * `<link rel="canonical">`, so the pair only stops competing if the HTTP header
 * says which one is the address. Losing this line silently splits the ranking
 * signals of every document on the site, which is exactly the kind of regression
 * nobody notices.
 */
describe("markdownResponse", () => {
  it("names the HTML page as canonical, in the header form", () => {
    const res = markdownResponse("# Body\n", { canonicalPath: "/reviews/a-slug" });
    // Built from SITE_URL rather than a literal host: the test environment has no
    // NEXT_PUBLIC_SITE_URL, and hardcoding production here would pass for the
    // wrong reason on a preview deploy.
    expect(res.headers.get("Link")).toBe(`<${SITE_URL}/reviews/a-slug>; rel="canonical"`);
  });

  it("stays indexable, because these documents exist to be quoted", () => {
    const res = markdownResponse("# Body\n", { canonicalPath: "/movies/parasite-2019" });
    expect(res.headers.get("X-Robots-Tag")).toBe("index, follow");
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
  });

  it("sends no canonical for a document that is not a rendition of a page", () => {
    // llms.txt is itself the page; pointing it at another URL would be a lie.
    const res = markdownResponse("# llms\n", { maxAge: 1800 });
    expect(res.headers.get("Link")).toBeNull();
    expect(res.headers.get("Cache-Control")).toContain("max-age=1800");
  });
});

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
    deathPlace: null,
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

  it("exports a sourced place of death when known", () => {
    const md = personToMarkdown({
      ...person,
      deathDate: new Date("2020-01-01"),
      deathPlace: "Rancho Santa Fe, San Diego County",
    });
    expect(md).toContain("died: '2020-01-01'");
    expect(md).toContain("deathplace: 'Rancho Santa Fe, San Diego County'");
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

describe("movieToMarkdown: ours versus imported", () => {
  const film = {
    id: "m1",
    slug: "parasite-2019",
    title: "Parasite",
    originalTitle: null,
    tagline: null,
    overview: null,
    releaseDate: new Date("2019-05-30"),
    runtime: 133,
    certification: "R",
    director: "Bong Joon-ho",
    genres: ["Drama"],
    keywords: ["basement", "class"],
    countries: ["South Korea"],
    posterPath: null,
    imdbId: null,
    homepage: null,
    collectionName: null,
    updatedAt: new Date("2026-07-30"),
    cast: [],
    crew: [],
    reviews: [],
    topics: [
      {
        slug: "class-divide",
        name: "Class Divide",
        kind: "THEME" as const,
        note: "One downpour, two addresses.",
      },
      {
        slug: "stairs-and-levels",
        name: "Stairs and Levels",
        kind: "MOTIF" as const,
        note: null,
      },
    ],
  };

  it("labels the TMDB keyword list as TMDB's", () => {
    // This line used to read "Themes:", handing a machine reader an imported
    // keyword list as though it were this site's reading of the film.
    const md = movieToMarkdown(film);
    expect(md).toContain("TMDB keywords: basement, class");
    expect(md).not.toContain("Themes: basement");
  });

  it("puts our axes in the front matter under `themes`", () => {
    const md = movieToMarkdown(film);
    expect(md).toContain("themes:\n  - 'Class Divide'\n  - 'Stairs and Levels'");
  });

  it("gives each axis its kind, its link and its sentence", () => {
    const md = movieToMarkdown(film);
    expect(md).toContain("## Themes & motifs");
    expect(md).toContain(
      "- [Class Divide](http://localhost:3000/topics/class-divide) (theme) — One downpour, two addresses.",
    );
    // No note yet: the axis is still listed, with no dash left dangling after it.
    expect(md).toContain(
      "- [Stairs and Levels](http://localhost:3000/topics/stairs-and-levels) (motif)\n",
    );
    expect(md).toContain("Editorial, not imported");
  });

  it("omits the section, and the front-matter key, for a film on no axis", () => {
    const md = movieToMarkdown({ ...film, topics: [] });
    expect(md).not.toContain("## Themes & motifs");
    expect(md).not.toContain("themes:");
    // The imported keywords still ship, under their own label.
    expect(md).toContain("TMDB keywords:");
  });
});

describe("topicToMarkdown", () => {
  const topic = {
    slug: "water-that-rises",
    name: "Water That Rises",
    kind: "MOTIF" as const,
    description: "Rain and flood as verdict rather than weather — the film's water isn't neutral.",
    essay: "The asymmetry is the point.",
    updatedAt: new Date("2026-07-30"),
    films: [
      {
        slug: "parasite-2019",
        title: "Parasite",
        year: 2019,
        note: "One downpour, two addresses, opposite meanings.",
        average: 9.5,
        reviewCount: 2,
      },
      {
        slug: "interstellar-2014",
        title: "Interstellar",
        year: 2014,
        note: "Mountains that turn out to be waves.",
        average: null,
        reviewCount: 0,
      },
    ],
  };

  it("declares the axis and its kind in the front matter", () => {
    const md = topicToMarkdown(topic);
    expect(md).toContain("type: 'topic'");
    expect(md).toContain("kind: 'motif'");
    expect(md).toContain("films_in_library: 2");
    expect(md).toContain("canonical: 'http://localhost:3000/topics/water-that-rises'");
    expect(md).toContain("updated: '2026-07-30'");
  });

  it("doubles an apostrophe rather than breaking the YAML quoting", () => {
    // "the film's water" inside a single-quoted scalar has to become "film''s",
    // or every consumer's parser stops at the apostrophe.
    expect(topicToMarkdown(topic)).toContain("the film''s water isn''t neutral.'");
  });

  it("carries the definition into the prose, not just the metadata", () => {
    expect(topicToMarkdown(topic)).toContain(
      "A motif in the CinePixo taxonomy: Rain and flood as verdict",
    );
  });

  it("keeps the curator's order, with this site's numbers and the note", () => {
    // Not re-sorted by year: the sequence is editorial, and the page presents
    // the same one, so a quote from either lands in the same place.
    const md = topicToMarkdown(topic);
    const parasite = md.indexOf("Parasite");
    const interstellar = md.indexOf("Interstellar");
    expect(parasite).toBeGreaterThan(-1);
    expect(parasite).toBeLessThan(interstellar);
    expect(topicToMarkdown({ ...topic, films: [...topic.films].reverse() }).indexOf("Interstellar"))
      .toBeLessThan(
        topicToMarkdown({ ...topic, films: [...topic.films].reverse() }).indexOf("Parasite"),
      );
    expect(md).toContain("- 2019 · [Parasite](http://localhost:3000/movies/parasite-2019)");
    expect(md).toContain("**9.5/10** from 2 reviews");
    expect(md).toContain("— One downpour, two addresses, opposite meanings.");
  });

  it("keeps an unreviewed film and its note, without inventing a rating", () => {
    const md = topicToMarkdown(topic);
    expect(md).toContain("[Interstellar](http://localhost:3000/movies/interstellar-2014)");
    expect(md).toContain("— Mountains that turn out to be waves.");
    // The only rating in the file is Parasite's.
    expect(md.match(/\/10\*\*/g)).toHaveLength(1);
  });

  it("runs the essay through the export rules, so nothing page-only leaves", () => {
    const md = topicToMarkdown({
      ...topic,
      essay: "See [Parasite](/movies/parasite-2019).\n:::still 2\nThe flood is the argument.",
    });
    expect(md).toContain("](http://localhost:3000/movies/parasite-2019)");
    expect(md).not.toContain(":::");
    expect(md).toContain("The flood is the argument.");
  });

  it("says an empty axis is empty instead of shipping a bare heading", () => {
    const md = topicToMarkdown({ ...topic, films: [], essay: null });
    expect(md).toContain("films_in_library: 0");
    expect(md).toContain("No films assigned yet.");
  });

  it("ends on the provenance claim, because the notes are the payload", () => {
    const md = topicToMarkdown(topic);
    expect(md).toContain("Source: http://localhost:3000/topics/water-that-rises");
    expect(md).toContain("nothing here is imported");
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
