// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewBody, type ReviewMedia } from "@/components/review/ReviewBody";
import { cjkEmphasisExtensions } from "@/components/review/editor/cjk-emphasis";
import { directiveExtensions } from "@/components/review/editor/directives";

/**
 * The WYSIWYG editor's one hard obligation: a review opened and saved without
 * edits must still be the same review. Markdown is the storage format, so the
 * test is md → editor → md — and equality is judged where it matters, on the
 * HTML ReviewBody renders, not on bytes (the serializer may reflow whitespace).
 */

const extensions = [
  StarterKit.configure({ underline: false, link: { openOnClick: false } }),
  Highlight,
  Image,
  TaskList,
  TaskItem.configure({ nested: true }),
  ...directiveExtensions,
  ...cjkEmphasisExtensions,
  Markdown,
];

function roundtrip(md: string): string {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions,
    content: md,
    contentType: "markdown",
  });
  try {
    return editor.getMarkdown();
  } finally {
    editor.destroy();
  }
}

const media: ReviewMedia = {
  title: "Parasite",
  trailerKey: "abc123",
  stills: ["/one.jpg", "/two.jpg", "/three.jpg"],
};

const rendered = (md: string) =>
  renderToStaticMarkup(<ReviewBody content={md} media={media} />);

/** Same page after the trip — the invariant every fixture must hold. */
function expectStablePage(md: string) {
  const out = roundtrip(md);
  expect(rendered(out)).toBe(rendered(md));
  return out;
}

describe("markdown round-trip through the WYSIWYG editor", () => {
  it("plain prose with emphasis, including the CJK shapes", () => {
    expectStablePage(
      [
        "## Space is class",
        "",
        "In *Parasite* the camera never stops moving **vertically**.",
        "",
        "**기생충!**은 이 문장에서 굵게. ~~걸작?~~은 취소선. ==하이라이트==도.",
      ].join("\n"),
    );
  });

  it("headings, pull quotes and dividers", () => {
    expectStablePage(
      [
        "## Section",
        "",
        "### Subsection",
        "",
        "> The film never explains class through dialogue. You feel it.",
        "",
        "---",
        "",
        "After the break.",
      ].join("\n"),
    );
  });

  it("lists: bullets, numbers, tasks, nesting", () => {
    expectStablePage(
      [
        "- point one",
        "- point two",
        "  - nested",
        "",
        "1. first",
        "2. second",
        "",
        "- [ ] unwatched",
        "- [x] rewatched",
      ].join("\n"),
    );
  });

  it("links and images", () => {
    expectStablePage(
      [
        "A [source](https://example.com/a) inline.",
        "",
        "![the staircase shot](/uploads/reviews/2026/07/abc.webp)",
      ].join("\n"),
    );
  });

  it("code, inline and fenced", () => {
    expectStablePage(
      ["Inline `code` here.", "", "```", "not ## a heading", "```"].join("\n"),
    );
  });

  it(":::spoiler keeps its content and its fence", () => {
    const out = expectStablePage(
      [
        "Before.",
        "",
        ":::spoiler",
        "The basement reveal changes **everything**.",
        "",
        "Even the second paragraph.",
        ":::",
        "",
        "After.",
      ].join("\n"),
    );
    expect(out).toContain(":::spoiler");
    expect(out).toMatch(/^:::$/m);
  });

  it(":::trailer and :::still survive with their indexes", () => {
    const out = expectStablePage(
      ["Watch this:", "", ":::trailer", "", ":::still 2", "", ":::still 3", "", "Done."].join("\n"),
    );
    expect(out).toContain(":::trailer");
    expect(out).toContain(":::still 2");
    expect(out).toContain(":::still 3");
  });

  it("an unterminated spoiler still round-trips covered", () => {
    const md = "Intro.\n\n:::spoiler\nnever closed";
    const out = roundtrip(md);
    expect(rendered(out)).toBe(rendered(md));
  });

  it("a realistic full review body", () => {
    expectStablePage(
      [
        "## Maximalism with a heart",
        "",
        "The Daniels hide a quiet immigrant-family drama inside the loudest movie of the decade. **에브리씽!**은 그걸 해낸다.",
        "",
        "> Every timeline is a what-if aimed at one marriage.",
        "",
        ":::trailer",
        "",
        "### Why the bagel works",
        "",
        "- it is ==literally everything==",
        "- it is *also* nothing",
        "",
        ":::spoiler",
        "The rock scene is the entire film in one cut: silence, then text, then love.",
        ":::",
        "",
        "![googly eye](/uploads/reviews/2026/07/eye.webp)",
        "",
        "A film about attention, reviewed with mine. [TMDB](https://www.themoviedb.org/movie/545611)",
      ].join("\n"),
    );
  });
});
