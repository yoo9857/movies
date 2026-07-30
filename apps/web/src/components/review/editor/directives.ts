/**
 * CinePixo's authoring directives as Tiptap nodes.
 *
 * The grammar here mirrors `ReviewBody.parse` line for line — that renderer is
 * the authority on what `:::spoiler` / `:::trailer` / `:::still N` mean, and
 * the editor's job is to write exactly what it reads. Anything the tokenizers
 * accept must serialize back to a form ReviewBody renders identically;
 * `roundtrip.test.tsx` holds both sides to that.
 */
import { Node } from "@tiptap/core";

/** Matches the shared opening-line grammar, e.g. `::: still 2`. */
const OPEN = /^:::[ \t]*(spoiler|trailer|still)[ \t]*(\d+)?[ \t]*(?:\n|$)/i;

/**
 * Hidden-until-revealed region. Block content, closed by a lone `:::` line;
 * an unterminated fence runs to the end of the document, exactly as the
 * renderer treats it.
 */
export const SpoilerBlock = Node.create({
  name: "spoiler",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-type='spoiler']" }];
  },

  renderHTML() {
    return ["div", { "data-type": "spoiler", class: "cx-edit-spoiler" }, 0];
  },

  markdownTokenName: "spoiler",

  markdownTokenizer: {
    name: "spoiler",
    level: "block",
    start: (src: string) => src.indexOf(":::"),
    tokenize(src, _tokens, lexer) {
      const open = /^:::[ \t]*spoiler[ \t]*(?:\n|$)/i.exec(src);
      if (!open) return undefined;

      const rest = src.slice(open[0].length);
      // The fence closes at the first line that is exactly `:::` (whitespace
      // tolerated) — same rule as the renderer.
      const close = /^[ \t]*:::[ \t]*$/m.exec(rest);
      const inner = close ? rest.slice(0, close.index).replace(/\n$/, "") : rest;
      const consumed = close
        ? open[0].length + close.index + close[0].length
        : src.length;
      // Take one trailing newline with us so the next block starts clean.
      const raw = src.slice(0, consumed) + (src[consumed] === "\n" ? "\n" : "");

      return {
        type: "spoiler",
        raw,
        tokens: lexer.blockTokens(inner),
      };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("spoiler", {}, helpers.parseChildren(token.tokens ?? []));
  },

  renderMarkdown(node, helpers) {
    const inner = node.content ? helpers.renderChildren(node.content, "\n\n") : "";
    return `:::spoiler\n${inner}\n:::`;
  },
});

/** The linked film's trailer, inline in the argument. A leaf: all it *is* is a marker. */
export const TrailerBlock = Node.create<{ trailerKey: string | null }>({
  name: "trailer",
  group: "block",
  atom: true,

  addOptions() {
    // The film's YouTube key, when the editor knows it — the node then shows
    // the real thumbnail instead of a labelled slot. Markdown is unaffected:
    // the key lives with the film, never in the text.
    return { trailerKey: null };
  },

  parseHTML() {
    return [{ tag: "div[data-type='trailer']" }];
  },

  renderHTML() {
    const key = this.options.trailerKey;
    if (!key) {
      return [
        "div",
        { "data-type": "trailer", class: "cx-edit-media" },
        "▶ Trailer — plays this film's trailer here",
      ];
    }
    return [
      "div",
      { "data-type": "trailer", class: "cx-edit-media cx-edit-media-preview" },
      [
        "img",
        {
          src: `https://i.ytimg.com/vi/${key}/hqdefault.jpg`,
          alt: "",
          draggable: "false",
        },
      ],
      ["span", {}, "▶ Trailer — plays inline on the page"],
    ];
  },

  markdownTokenName: "trailer",

  markdownTokenizer: {
    name: "trailer",
    level: "block",
    start: (src: string) => src.indexOf(":::"),
    tokenize(src) {
      const m = /^:::[ \t]*trailer[ \t]*(?:\n|$)/i.exec(src);
      if (!m) return undefined;
      return { type: "trailer", raw: m[0] };
    },
  },

  parseMarkdown(_token, helpers) {
    return helpers.createNode("trailer");
  },

  renderMarkdown() {
    return ":::trailer";
  },
});

/** Still #N from the film's gallery. 1-based, like the grammar it writes. */
export const StillBlock = Node.create<{ stills: string[] }>({
  name: "still",
  group: "block",
  atom: true,

  addOptions() {
    // TMDB paths for the chosen film's stills, when the editor knows them —
    // the node then shows the actual frame it refers to.
    return { stills: [] };
  },

  addAttributes() {
    return {
      index: {
        default: 1,
        parseHTML: (el) => Number(el.getAttribute("data-index") ?? 1) || 1,
        renderHTML: (attrs) => ({ "data-index": String(attrs.index) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='still']" }];
  },

  renderHTML({ node }) {
    const index = Number(node.attrs.index) || 1;
    const path = this.options.stills[index - 1];
    const base = {
      "data-type": "still",
      "data-index": String(index),
    };
    if (!path) {
      return [
        "div",
        { ...base, class: "cx-edit-media" },
        `🖼 Still #${index} — this film's still, full width`,
      ];
    }
    return [
      "div",
      { ...base, class: "cx-edit-media cx-edit-media-preview" },
      [
        "img",
        { src: `https://image.tmdb.org/t/p/w300${path}`, alt: "", draggable: "false" },
      ],
      ["span", {}, `🖼 Still #${index} — full width on the page`],
    ];
  },

  markdownTokenName: "still",

  markdownTokenizer: {
    name: "still",
    level: "block",
    start: (src: string) => src.indexOf(":::"),
    tokenize(src) {
      const m = /^:::[ \t]*still[ \t]*(\d+)?[ \t]*(?:\n|$)/i.exec(src);
      if (!m) return undefined;
      return { type: "still", raw: m[0], index: Math.max(1, Number(m[1] ?? 1)) };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("still", {
      index: (token as { index?: number }).index ?? 1,
    });
  },

  renderMarkdown(node) {
    return `:::still ${node.attrs?.index ?? 1}`;
  },
});

/** Everything the review grammar defines beyond CommonMark, in one import. */
export const directiveExtensions = [SpoilerBlock, TrailerBlock, StillBlock];

/** True when a line opens any directive — used by tests and guards. */
export function isDirectiveLine(line: string): boolean {
  return OPEN.test(line.trim());
}
