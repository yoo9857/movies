/**
 * Which paths have a Markdown rendition at `<path>.md`.
 *
 * Its own module, with no imports, because `proxy.ts` runs in the edge runtime
 * and needs this — the same reason `lib/csp.ts` exists. Keeping it out of
 * `markdown-export.ts` also keeps that file's `next/headers`-adjacent
 * dependencies out of the proxy bundle.
 *
 * The rewrites in `next.config.ts` are the other half of this pair: six
 * `/{section}/:slug.md` sources, and this predicate has to name the same six.
 * Add a seventh rendition and both need the entry, or the header will advertise
 * a document that 404s — or worse, stay silent about one that exists.
 */
const HAS_MARKDOWN = /^\/(?:reviews|movies|people|topics|blog|critics)\/[a-z0-9-]+$/;

/**
 * One path segment after the section, and no dot in it. That single shape is
 * carrying four exclusions worth stating out loud:
 *
 *  · **listings** — `/reviews`, `/movies` and the rest have no rendition;
 *  · **`/blog/category/*`** — a shelf is two segments deep and has none either;
 *  · **`/blog/feed.xml`** and every other dotted file under a section prefix,
 *    which `[a-z0-9-]+` refuses because of the dot;
 *  · **the `.md` URLs themselves**, for the same reason — a rendition must not
 *    advertise a rendition of itself.
 */
export function markdownAlternateFor(pathname: string): string | null {
  return HAS_MARKDOWN.test(pathname) ? `${pathname}.md` : null;
}
