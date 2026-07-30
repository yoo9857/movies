import { describe, expect, it } from "vitest";
import { exportMarkdownBody } from "@/lib/markdown-export";
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
