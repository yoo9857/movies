/**
 * Which browse states this site offers a search engine as destinations.
 *
 * The film library and the people directory are filled in bulk from Wikidata —
 * some 119,000 films and 208,000 names — and a page that restates an import is
 * already `noindex` on its own merits: see the rule on the film page
 * (`(site)/movies/[slug]/page.tsx`) and the matching `where` clauses in
 * `lib/sitemap-data.ts`. A film earns indexing the moment somebody writes about
 * it; a person, the moment somebody writes about them or about a film of theirs.
 *
 * What was missing was the same judgement applied to the *listings*, and the
 * listings are where the arithmetic gets away from you. The library page shows
 * thirty rows and paginates, and it takes a genre and a decade: 18 × 13 × up to
 * 500 pages is on the order of 20–30 thousand URLs. The people page slices
 * 208,000 names by 8 departments and 27 initials: another 251. Every one of them
 * answered 200 with `index, follow` and a self-canonical, against some seventy
 * pages on this site that contain a sentence a person wrote. A crawler offered
 * that ratio does not conclude "film criticism"; it concludes "directory", and
 * an ad network reviewing the same pages concludes the same thing.
 *
 * So: a browse state is a destination only where the sitemap says so, and
 * everything else is `noindex, follow` — walkable, not offered. `follow` is
 * load-bearing in both, because the pagination and the letter bar are how a
 * crawler reaches the films and the people, and those are how it reaches the
 * reviews.
 *
 * These two predicates and `browseStates` in `lib/sitemap-data.ts` are one
 * decision written twice. Widen one and you must widen the other in the same
 * commit: a sitemap that submits a URL the page marks `noindex` asks a crawler
 * to fetch a page in order to be told to forget it, and a page that indexes a
 * state the sitemap never mentions is the thin surface this file exists to shut.
 * `test/browse-index.test.ts` pins both directions.
 */

/**
 * A film-library browse state is indexable when it is one facet deep, page one:
 * `/movies`, `/movies?genre=Drama`, `/movies?decade=1990`. Thirty-two URLs, each
 * a phrase people actually search ("westerns", "films from the 1990s").
 *
 * Page two onward is out because the films on it are reachable and not worth
 * arriving at. A genre *and* a decade is out because it is a cross-section:
 * real enough to browse, too narrow and too numerous — 234 of them — to be
 * worth that many more addresses.
 */
export function movieBrowseIsIndexable(
  genre: string,
  decade: number | null,
  page: number,
): boolean {
  if (page > 1) return false;
  return !(genre && decade != null);
}

/**
 * Only `/people` itself. A role or an initial changes which names are listed, so
 * each keeps its own canonical — but a page whose entire content is a list of
 * pages that are themselves `noindex` cannot be worth more than its contents,
 * and slicing an import by alphabet is the clearest case of that there is.
 */
export function peopleBrowseIsIndexable(role: string | null, letter: string | null): boolean {
  return !role && !letter;
}
