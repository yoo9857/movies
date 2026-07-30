/**
 * Name folding and initials.
 *
 * Every pattern here is built from ASCII-only source: the characters these rules
 * are *about* are invisible in an editor or easy for a tool to mangle, and a
 * silently corrupted character class would make the folding quietly wrong rather
 * than fail. Nothing below contains a literal non-ASCII character.
 */

/** Anything outside ASCII, for the pre-pass below. */
const NON_ASCII = new RegExp("[^\\x00-\\x7F]", "g");
/** Combining diacritical marks, left behind by an NFKD decomposition. */
const COMBINING = new RegExp("[\\u0300-\\u036F]", "g");
/** Everything that is not a letter or a digit, after folding. */
const NOT_ALNUM = /[^a-z0-9]+/g;

/**
 * Latin letters that NFKD does not decompose.
 *
 * Normalising with NFKD and stripping combining marks turns "e-acute" into "e",
 * but l-stroke, o-slash, d-stroke and their kin carry the stroke *inside* the
 * code point. They survive the decomposition and are then removed as
 * punctuation — which is how "Andrzej Sekula" failed to match the article
 * spelled with the letter his name actually uses.
 *
 * Keyed by code point so this table cannot be damaged by an encoding round trip.
 */
const UNDECOMPOSABLE = new Map<string, string>(
  (
    [
      [0x0142, "l"], // l with stroke
      [0x0141, "l"],
      [0x00f8, "o"], // o with stroke
      [0x00d8, "o"],
      [0x0111, "d"], // d with stroke
      [0x0110, "d"],
      [0x00f0, "d"], // eth
      [0x00d0, "d"],
      [0x0127, "h"], // h with stroke
      [0x0126, "h"],
      [0x0131, "i"], // dotless i
      [0x0130, "i"],
      [0x0167, "t"], // t with stroke
      [0x0166, "t"],
      [0x00df, "ss"], // sharp s
      [0x00e6, "ae"],
      [0x00c6, "ae"],
      [0x0153, "oe"],
      [0x0152, "oe"],
      [0x00fe, "th"], // thorn
      [0x00de, "th"],
    ] as [number, string][]
  ).map(([code, replacement]) => [String.fromCodePoint(code), replacement]),
);

/**
 * A name reduced to what identity survives spelling: lowercase, no accents, no
 * punctuation. Two spellings that fold to the same string are the same person.
 */
export function foldName(value: string): string {
  return value
    .replace(NON_ASCII, (ch) => UNDECOMPOSABLE.get(ch) ?? ch)
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING, "")
    .replace(NOT_ALNUM, " ")
    .trim();
}

/**
 * Initials for someone with no portrait: "Bong Joon-ho" gives "BJ".
 *
 * One definition, because two renderers draw it — the page component and the
 * Open Graph card — and initials that disagreed between a page and its share
 * preview would look like a bug in both.
 *
 * Spread rather than `charAt`, so a name whose first letter is outside the BMP
 * yields that letter instead of half of its surrogate pair.
 */
export function monogram(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((w) => [...w][0] ?? "")
    .join("")
    .toUpperCase();
}
