import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  definedTermNode,
  definedTermSetNode,
  graph,
  IMAGE_TERMS_PATH,
  imageObjectNode,
  LOGO_ID,
  movieNode,
  ORG_ID,
  organizationNode,
  reviewNode,
  topicEntityId,
  TOPIC_SET_ID,
} from "@/lib/seo";

/**
 * How the taxonomy is wired into the graph.
 *
 * The rule these tests defend: a film page references the axes it carries by
 * `@id` and never inlines their definitions, because the definition is rendered
 * on the topic page and nowhere else. Get this wrong in the other direction and
 * every film page starts asserting text no visitor can see.
 */

const FILM = { id: "m1", slug: "parasite-2019", title: "Parasite" };

/** `about` is a ref or a list of refs; normalise to ids for assertions. */
function aboutIds(node: Record<string, unknown>): string[] {
  const about = node.about as { "@id": string }[] | undefined;
  return (about ?? []).map((a) => a["@id"]);
}

describe("movieNode and the taxonomy", () => {
  it("links each axis by @id, in order", () => {
    const node = movieNode(FILM, {
      topicIds: [topicEntityId("class-divide"), topicEntityId("stairs-and-levels")],
    }) as unknown as Record<string, unknown>;

    expect(aboutIds(node)).toEqual([
      "http://localhost:3000/topics/class-divide#term",
      "http://localhost:3000/topics/stairs-and-levels#term",
    ]);
  });

  it("inlines no definition — only the reference", () => {
    const node = movieNode(FILM, {
      topicIds: [topicEntityId("class-divide")],
    }) as unknown as Record<string, unknown>;
    // A ref is exactly one key. Anything more would be this page claiming a
    // definition it does not render.
    expect(Object.keys((node.about as object[])[0])).toEqual(["@id"]);
    expect(JSON.stringify(node)).not.toContain("DefinedTerm");
  });

  it("omits `about` entirely for a film on no axis", () => {
    for (const opts of [{}, { topicIds: [] }]) {
      const node = movieNode(FILM, opts) as unknown as Record<string, unknown>;
      expect("about" in node).toBe(false);
    }
  });

  it("keeps TMDB keywords and our axes in separate properties", () => {
    const node = movieNode(
      { ...FILM, keywords: ["basement", "class"] },
      { topicIds: [topicEntityId("class-divide")] },
    ) as unknown as Record<string, unknown>;

    expect(node.keywords).toBe("basement, class");
    expect(aboutIds(node)).toEqual(["http://localhost:3000/topics/class-divide#term"]);
  });
});

describe("the term nodes the topic page owns", () => {
  it("defines the term, sets its kind and joins it to the one set", () => {
    const term = definedTermNode({
      slug: "class-divide",
      name: "Class Divide",
      kind: "THEME",
      description: "Inequality staged as geography.",
    }) as unknown as Record<string, unknown>;

    expect(term["@id"]).toBe("http://localhost:3000/topics/class-divide#term");
    expect(term["@type"]).toBe("DefinedTerm");
    expect(term.termCode).toBe("THEME");
    expect(term.description).toBe("Inequality staged as geography.");
    expect(term.inDefinedTermSet).toEqual({ "@id": TOPIC_SET_ID });
  });

  it("resolves the film's reference inside a single graph", () => {
    // The point of the whole arrangement: one @graph in which the film's
    // `about` id is answered by a node that actually defines the term.
    const doc = graph(
      movieNode(FILM, { topicIds: [topicEntityId("class-divide")] }),
      definedTermSetNode(),
      definedTermNode({ slug: "class-divide", name: "Class Divide", kind: "THEME" }),
    ) as unknown as { "@graph": Record<string, unknown>[] };

    const film = doc["@graph"].find((n) => n["@type"] === "Movie")!;
    const ids = new Set(doc["@graph"].map((n) => n["@id"] as string));
    for (const id of aboutIds(film)) expect(ids.has(id)).toBe(true);
  });
});

/**
 * `uploadDate` is a DateTime, not a Date.
 *
 * Search Console raised two "video structured data" issues against this site —
 * "uploadDate의 datetime 값이 잘못됨" and "시간대가 누락됨" — which were one bug:
 * the property was filled with `isoDay`, so a film released in 1954 emitted
 * "1954-07-28" where schema.org wants an instant. Both spellings of the trailer
 * (a YouTube key and a file on our own storage) went through that fallback, so
 * both are pinned here.
 */
describe("VideoObject uploadDate", () => {
  const RELEASED = new Date("1954-07-28T00:00:00.000Z");
  const withZone = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;

  function trailerOf(movie: Record<string, unknown>): Record<string, unknown> {
    const node = movieNode(movie as never, {}) as unknown as Record<string, unknown>;
    return node.trailer as Record<string, unknown>;
  }

  it("carries a zone for a YouTube trailer", () => {
    const trailer = trailerOf({ ...FILM, releaseDate: RELEASED, trailerKey: "abcdefghijk" });
    expect(trailer.uploadDate).toMatch(withZone);
  });

  it("carries a zone for a trailer on our own storage", () => {
    const trailer = trailerOf({
      ...FILM,
      releaseDate: RELEASED,
      trailerFile: "/uploads/trailers/2026/07/x.webm",
    });
    expect(trailer.uploadDate).toMatch(withZone);
    // Our own file is described by what it is, not by an embed we do not render.
    expect(trailer.contentUrl).toContain("/uploads/trailers/");
    expect(trailer.embedUrl).toBeUndefined();
  });
});

/**
 * The Movie node carries the poster we host.
 *
 * `posterUrl` has answered undefined since TMDB paths stopped being handed to
 * browsers — correct for the pages, but it quietly stripped `image` from every
 * Movie node in the graph, and `itemReviewed.image` is what review snippets
 * key on. The poster in `movie.image` is our own file and the one the page
 * actually renders.
 */
describe("movieNode image", () => {
  it("uses our hosted poster, absolutised", () => {
    const node = movieNode(
      { ...FILM, image: "/uploads/films/2026/07/x.webp" },
      {},
    ) as unknown as Record<string, unknown>;
    expect(node.image).toEqual(["http://localhost:3000/uploads/films/2026/07/x.webp"]);
    expect(node.thumbnailUrl).toBe("http://localhost:3000/uploads/films/2026/07/x.webp");
  });

  it("leaves a bucket URL alone rather than double-prefixing it", () => {
    const bucket = "https://pokemon-dive.us-lax-4.linodeobjects.com/cinepixo/films/x.webp";
    const node = movieNode({ ...FILM, image: bucket }, { brief: true }) as unknown as Record<
      string,
      unknown
    >;
    expect(node.image).toBe(bucket);
  });
});

describe("reviewNode image", () => {
  it("leads with the same hosted artwork as the reviewed movie", () => {
    const image = "/uploads/films/2026/08/parasite.webp";
    const node = reviewNode(
      {
        slug: "parasite-review",
        title: "Parasite review",
        content: "A review.",
        rating: 9,
      },
      {
        author: { username: "critic" },
        movie: { ...FILM, image },
      },
    ) as unknown as Record<string, unknown>;

    expect(node.image).toEqual([`http://localhost:3000${image}`]);
  });
});

/**
 * Google's image-metadata report reads five properties off an `ImageObject`
 * and reports the missing ones per URL. The site logo carries `contentUrl` and
 * appears on every page, which is why a gap there was reported as three issues
 * across the whole site on 2026-08-07 — and why it is pinned here.
 */
describe("the logo is a fully described image", () => {
  const logo = () =>
    (organizationNode() as unknown as Record<string, unknown>).logo as Record<string, unknown>;

  it("keeps its identity, its file and its dimensions", () => {
    expect(logo()["@id"]).toBe(LOGO_ID);
    expect(logo().url).toBe("http://localhost:3000/logo.png");
    expect(logo().contentUrl).toBe("http://localhost:3000/logo.png");
    expect(logo().width).toBe(256);
  });

  it("names the five properties the image metadata feature reads", () => {
    expect(logo().creditText).toBe("CinePixo");
    // Our own mark: the Organization in this same graph made it.
    expect(logo().creator).toEqual({ "@id": ORG_ID });
    expect(logo().copyrightNotice).toBe("© CinePixo");
    expect(logo().license).toBe(`http://localhost:3000${IMAGE_TERMS_PATH}`);
    expect(logo().acquireLicensePage).toBe("http://localhost:3000/contact");
  });

  it("points `license` at a section the terms page actually anchors", () => {
    // `/terms#artwork` is a promise to a crawler; the page has to keep it.
    const terms = readFileSync(
      new URL("../src/app/(site)/terms/page.tsx", import.meta.url),
      "utf8",
    );
    expect(IMAGE_TERMS_PATH).toBe("/terms#artwork");
    expect(terms).toContain('id="artwork"');
  });
});

describe("imageObjectNode", () => {
  it("says nothing at all about a file that isn't there", () => {
    expect(imageObjectNode({ url: null })).toBeUndefined();
  });

  it("offers no licence page when there is no licence to acquire", () => {
    const n = imageObjectNode({
      url: "/uploads/x.webp",
      credit: "The desk",
      sourceUrl: "https://example.com/where-it-came-from",
    })!;
    expect("acquireLicensePage" in n).toBe(false);
    expect(n.creditText).toBe("The desk");
  });
});

/**
 * A credit column holds two different claims, and 97% of this library holds the
 * one that is not a byline: "© the film's rights holders", licensed "Poster
 * shown for identification". Published as `creator` and `acquireLicensePage` —
 * which is what happened on 2026-08-07 until a live page was read back — that
 * is a sentence pretending to be a person and a licence that does not exist.
 */
describe("a rights notice is not an author", () => {
  const identification = () =>
    imageObjectNode({
      url: "/uploads/films/x.webp",
      credit: "© the film's rights holders",
      license: "Poster shown for identification",
      sourceUrl: "https://en.wikipedia.org/wiki/Parasite_(2019_film)",
    })!;

  it("keeps the notice as a notice and names no creator", () => {
    const n = identification();
    expect(n.copyrightNotice).toBe("© the film's rights holders");
    expect(n.creditText).toBe("© the film's rights holders");
    expect("creator" in n).toBe(false);
  });

  it("offers no licence page for a use we claim rather than terms we hold", () => {
    const n = identification();
    expect("license" in n).toBe(false);
    expect("acquireLicensePage" in n).toBe(false);
  });

  it("does not double the © it was given", () => {
    const n = imageObjectNode({ url: "/x.webp", credit: "Copyright 1954 Toho" })!;
    expect(n.copyrightNotice).toBe("Copyright 1954 Toho");
  });

  it("still reads a named author as an author, deed or no deed", () => {
    const n = imageObjectNode({
      url: "/uploads/films/y.webp",
      credit: "Reynold Brown",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Poster.jpg",
    })!;
    expect(n.creator).toEqual({ "@type": "Person", name: "Reynold Brown" });
    // Public domain: no © to claim, and no deed to link either.
    expect("copyrightNotice" in n).toBe(false);
    expect("acquireLicensePage" in n).toBe(false);
  });

  it("acquires only against a real deed", () => {
    const n = imageObjectNode({
      url: "/uploads/films/z.webp",
      credit: "K-Films Amérique",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Sheet.jpg",
    })!;
    expect(n.license).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(n.acquireLicensePage).toBe("https://commons.wikimedia.org/wiki/File:Sheet.jpg");
  });
});
