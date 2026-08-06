import { describe, expect, it } from "vitest";
import { eventKey, photoPlan, pickPhotos, unwrapRedirect, type Photo } from "@/lib/gather-sources";
import { plainText } from "@/lib/seo";

const photo = (title: string, day: string): Photo => ({
  title,
  day,
  url: `https://upload.example/${title}.jpg`,
  credit: "Someone",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  sourceUrl: `https://commons.example/${title}`,
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
