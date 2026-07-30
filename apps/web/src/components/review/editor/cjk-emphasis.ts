/**
 * CJK-friendly emphasis parsing for the editor's markdown side.
 *
 * The site's renderer uses remark-cjk-friendly, so `**기생충!**은` is bold on
 * every published page. The editor parses markdown with marked, which applies
 * the stock CommonMark flanking rules and reads the same text as literal
 * asterisks — and a literal that reaches the document gets backslash-escaped on
 * the way out, turning formatting into visible punctuation. These tokenizers
 * close that gap.
 *
 * They are deliberately narrow: each one fires only when CJK text is involved
 * (in the emphasised run or immediately after it). Everything else falls
 * through to marked's stock rules, so English parsing stays byte-for-byte
 * standard.
 */
import { Extension } from "@tiptap/core";

const CJK =
  /[ᄀ-ᇿ぀-ヿ㄰-㆏ㇰ-ㇿ㐀-䶿一-鿿가-힯豈-﫿]/;

/** Fire only where the stock rules and the site's renderer disagree. */
function involvesCjk(inner: string, following: string): boolean {
  return CJK.test(inner) || CJK.test(following.slice(0, 1));
}

interface Tokenized {
  raw: string;
  inner: string;
}

/** Match `open…close` at the start of src, inner non-empty and space-trimmed. */
function matchPair(src: string, open: string, close: string): Tokenized | undefined {
  if (!src.startsWith(open)) return undefined;
  // Emphasis never spans a blank line; search within the run.
  const stop = src.indexOf("\n\n");
  const haystack = stop === -1 ? src : src.slice(0, stop);
  const at = haystack.indexOf(close, open.length);
  if (at === -1) return undefined;
  const inner = haystack.slice(open.length, at);
  if (!inner || /^\s|\s$/.test(inner)) return undefined;
  // `***` ambiguity is the stock rules' job, not ours.
  if (haystack[at + close.length] === close[0]) return undefined;
  return { raw: haystack.slice(0, at + close.length), inner };
}

function cjkTokenizer(tokenType: string, open: string, close: string) {
  return {
    name: tokenType,
    level: "inline" as const,
    start: (src: string) => src.indexOf(open),
    tokenize(src: string, _tokens: unknown, lexer: { inlineTokens: (s: string) => unknown[] }) {
      const m = matchPair(src, open, close);
      if (!m) return undefined;
      if (!involvesCjk(m.inner, src.slice(m.raw.length))) return undefined;
      return {
        type: tokenType,
        raw: m.raw,
        tokens: lexer.inlineTokens(m.inner),
      } as never;
    },
  };
}

// Each extension carries one tokenizer; the emitted token types ("strong",
// "em", "del") are the stock marked names, so the Bold / Italic / Strike
// extensions' own parse handlers pick them up — no custom node handling here.
export const CjkStrong = Extension.create({
  name: "cjkStrong",
  markdownTokenizer: cjkTokenizer("strong", "**", "**"),
});

export const CjkEm = Extension.create({
  name: "cjkEm",
  markdownTokenizer: cjkTokenizer("em", "*", "*"),
});

export const CjkDel = Extension.create({
  name: "cjkDel",
  markdownTokenizer: cjkTokenizer("del", "~~", "~~"),
});

export const cjkEmphasisExtensions = [CjkStrong, CjkEm, CjkDel];
