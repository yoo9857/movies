/**
 * Initials for someone with no portrait: "Bong Joon-ho" → "BJ".
 *
 * One definition, because two renderers draw it — the page component and the
 * Open Graph card — and initials that disagreed between the page and its share
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
