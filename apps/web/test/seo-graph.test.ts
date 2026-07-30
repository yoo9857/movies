import { describe, expect, it } from "vitest";
import {
  definedTermNode,
  definedTermSetNode,
  graph,
  movieNode,
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
