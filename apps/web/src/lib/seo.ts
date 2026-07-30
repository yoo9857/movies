// SEO + GEO layer.
//
// Two audiences read this site's markup and neither of them is a person:
//
//  · classic crawlers, which want canonical URLs, one honest description per
//    page, and Open Graph images with dimensions
//  · answer engines (Google AI, ChatGPT, Claude, Perplexity), which want an
//    unambiguous *entity graph* — who wrote what, about which film, scored how,
//    and how that connects to the rest of the site
//
// The second is why every node below carries an `@id`. Isolated JSON-LD blobs
// tell a machine "here is a review"; a linked graph tells it "this review, by
// this member, of this film, published by this organisation, on this page" —
// and that is what gets a site quoted rather than merely indexed.
//
// Rules of the house:
//  · one canonical URL per page, always absolute, built from SITE_URL
//  · never claim a rating, date or count that isn't rendered on the page
//  · `compact()` every node, because an empty string is worse than a missing
//    property: it asserts "this is blank" instead of "we don't know"

import type { Metadata } from "next";
import {
  CONTACT_EMAIL,
  SITE_ABOUT,
  SITE_DESCRIPTION,
  SITE_FOUNDED,
  SITE_KEYWORDS,
  SITE_LANG,
  SITE_LOCALE,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  SOCIAL_PROFILES,
} from "./site";

export type JsonLdNode = Record<string, unknown>;
type Nullable<T> = T | null | undefined;

/* ────────────────────────────── primitives ────────────────────────────── */

/** Absolute URL from a site-relative path. Passes through absolute inputs. */
export function absUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export type TmdbSize =
  | "w92"
  | "w154"
  | "w185"
  | "w342"
  | "w500"
  | "w780"
  | "w1280"
  | "original";

/** TMDB CDN URL for a stored image path. */
export function tmdbImage(path: Nullable<string>, size: TmdbSize): string | undefined {
  if (!path) return undefined;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export const posterUrl = (p: Nullable<string>, size: TmdbSize = "w500") => tmdbImage(p, size);
export const backdropUrl = (p: Nullable<string>, size: TmdbSize = "w1280") => tmdbImage(p, size);

/** YouTube artefacts, on the privacy-preserving domain the CSP allows. */
export const youtubeEmbed = (key: string) => `https://www.youtube-nocookie.com/embed/${key}`;
export const youtubeThumb = (key: string) => `https://i.ytimg.com/vi/${key}/hqdefault.jpg`;
export const youtubeWatch = (key: string) => `https://www.youtube.com/watch?v=${key}`;

/** Markdown → prose. Used for descriptions, feed summaries and `reviewBody`. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/^\s{0,3}:::.*$/gm, " ") // authoring directives (:::spoiler / :::still 2)
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "") // list markers
    .replace(/^\s{0,3}([-*_])\s*(\1\s*){2,}$/gm, " ") // thematic breaks
    .replace(/(\*\*|__|\*|_|~~)/g, "") // emphasis
    .replace(/<[^>]+>/g, " ") // stray HTML
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clamp to a length search results and answer engines will actually show,
 * breaking on a word so the tail never reads as truncated mid-syllable.
 */
export function clamp(text: Nullable<string>, max = 158): string | undefined {
  if (!text) return undefined;
  const s = text.replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

/** ISO-8601 date (no time) — what schema.org wants for a release or birth. */
export function isoDay(d: Nullable<Date | string>): string | undefined {
  if (!d) return undefined;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

export function isoStamp(d: Nullable<Date | string>): string | undefined {
  if (!d) return undefined;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Minutes → ISO-8601 duration, e.g. 132 → "PT2H12M". */
export function isoDuration(minutes: Nullable<number>): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h > 0 ? `${h}H` : ""}${m > 0 || h === 0 ? `${m}M` : ""}`;
}

export function wordCount(markdown: string): number {
  const t = plainText(markdown);
  return t ? t.split(/\s+/).length : 0;
}

/** Drop undefined / null / empty-collection properties. See header note. */
function compact<T extends JsonLdNode>(node: T): T {
  for (const key of Object.keys(node)) {
    const v = node[key];
    const empty =
      v === undefined ||
      v === null ||
      v === "" ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);
    if (empty) delete node[key];
  }
  return node;
}

/** A reference to another node in the graph, rather than a duplicate of it. */
const ref = (id: string) => ({ "@id": id });

/* ─────────────────────────────── entity ids ─────────────────────────────── */
//
// Stable, absolute, fragment-scoped. `#organization` on the origin means "the
// publisher", forever — even if the review that first mentioned it is deleted.

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const LOGO_ID = `${SITE_URL}/#logo`;

export const pageId = (path: string) => `${absUrl(path)}#webpage`;
export const breadcrumbId = (path: string) => `${absUrl(path)}#breadcrumb`;
export const movieEntityId = (slug: string) => `${SITE_URL}/movies/${slug}#movie`;
export const reviewEntityId = (slug: string) => `${SITE_URL}/reviews/${slug}#review`;
export const criticEntityId = (slug: string) => `${SITE_URL}/critics/${slug}#person`;

const nameSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";

/** Members have no public profile page, so their identity hangs off the site. */
export const memberEntityId = (username: string) =>
  `${SITE_URL}/#/schema/member/${nameSlug(username)}`;

/** Cast, crew and directors: no page either, but a shared id de-duplicates a
 *  writer-director across the `director` and `author` slots of one film. */
export const personEntityId = (name: string) => `${SITE_URL}/#/schema/person/${nameSlug(name)}`;

/** A person we have a page for. Their page owns their identity. */
export const peopleEntityId = (slug: string) => `${SITE_URL}/people/${slug}#person`;

/* ───────────────────────────── site-wide nodes ───────────────────────────── */

export function organizationNode(): JsonLdNode {
  return compact({
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: `${SITE_NAME} — ${SITE_TAGLINE}`,
    url: `${SITE_URL}/`,
    description: SITE_ABOUT,
    slogan: SITE_TAGLINE,
    foundingDate: SITE_FOUNDED,
    email: CONTACT_EMAIL,
    logo: {
      "@type": "ImageObject",
      "@id": LOGO_ID,
      url: absUrl("/logo.png"),
      contentUrl: absUrl("/logo.png"),
      width: 256,
      height: 256,
      caption: SITE_NAME,
    },
    image: ref(LOGO_ID),
    sameAs: SOCIAL_PROFILES,
    knowsAbout: SITE_KEYWORDS,
    // The rating rules are published, not implied — an answer engine that cites
    // one of our scores can find out exactly what the number means.
    publishingPrinciples: absUrl("/about"),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "editorial",
      email: CONTACT_EMAIL,
      availableLanguage: ["English"],
    },
  });
}

export function webSiteNode(): JsonLdNode {
  return compact({
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    alternateName: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    inLanguage: SITE_LANG,
    publisher: ref(ORG_ID),
    copyrightHolder: ref(ORG_ID),
    keywords: SITE_KEYWORDS.join(", "),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  });
}

/* ──────────────────────────────── page nodes ──────────────────────────────── */

export type PageKind =
  | "WebPage"
  | "CollectionPage"
  | "ItemPage"
  | "AboutPage"
  | "ProfilePage"
  | "SearchResultsPage";

export interface WebPageInput {
  path: string;
  name: string;
  description?: Nullable<string>;
  kind?: PageKind;
  image?: Nullable<string>;
  datePublished?: Nullable<Date | string>;
  dateModified?: Nullable<Date | string>;
  /** Set when a `breadcrumbNode` for the same path is in the graph. */
  hasBreadcrumb?: boolean;
  /** `@id` of the thing this page is primarily about. */
  aboutId?: string;
  /** `@id` of the thing this page *is* — a review page's review, say. */
  mainEntityId?: string;
  keywords?: readonly string[];
  /** CSS selectors an assistant may read aloud — the verdict, not the nav. */
  speakableSelectors?: readonly string[];
  /** Sibling URL serving the same content as clean Markdown. */
  markdownUrl?: string;
}

export function webPageNode(input: WebPageInput): JsonLdNode {
  const url = absUrl(input.path);
  return compact({
    "@type": input.kind ?? "WebPage",
    "@id": pageId(input.path),
    url,
    name: input.name,
    description: clamp(input.description ?? undefined, 300),
    isPartOf: ref(WEBSITE_ID),
    inLanguage: SITE_LANG,
    datePublished: isoStamp(input.datePublished),
    dateModified: isoStamp(input.dateModified),
    primaryImageOfPage: input.image ? { "@type": "ImageObject", url: input.image } : undefined,
    breadcrumb: input.hasBreadcrumb ? ref(breadcrumbId(input.path)) : undefined,
    about: input.aboutId ? ref(input.aboutId) : undefined,
    mainEntity: input.mainEntityId ? ref(input.mainEntityId) : undefined,
    keywords: input.keywords?.length ? input.keywords.join(", ") : undefined,
    isAccessibleForFree: true,
    publisher: ref(ORG_ID),
    speakable: input.speakableSelectors?.length
      ? {
          "@type": "SpeakableSpecification",
          cssSelector: [...input.speakableSelectors],
        }
      : undefined,
    // Answer engines increasingly prefer a Markdown rendition when offered one.
    encoding: input.markdownUrl
      ? { "@type": "MediaObject", encodingFormat: "text/markdown", contentUrl: input.markdownUrl }
      : undefined,
  });
}

export interface Crumb {
  name: string;
  path?: string;
}

/** Trail excluding Home, which is prepended. Last crumb needs no path. */
export function breadcrumbNode(path: string, trail: readonly Crumb[]): JsonLdNode {
  const all: Crumb[] = [{ name: "Home", path: "/" }, ...trail];
  return {
    "@type": "BreadcrumbList",
    "@id": breadcrumbId(path),
    itemListElement: all.map((c, i) => {
      const isLast = i === all.length - 1;
      return compact({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        // The terminal crumb is the page itself; omitting `item` there is what
        // Google's spec asks for.
        item: !isLast && c.path ? absUrl(c.path) : undefined,
      });
    }),
  };
}

/* ─────────────────────────────── people ─────────────────────────────── */

/** A cast/crew name with no page of its own. */
export function personNode(
  name: string,
  extra?: JsonLdNode,
  /** Their page's slug, when we have one — then the page owns the identity. */
  slug?: Nullable<string>,
): JsonLdNode {
  return compact({
    "@type": "Person",
    "@id": slug ? peopleEntityId(slug) : personEntityId(name),
    name,
    url: slug ? absUrl(`/people/${slug}`) : undefined,
    ...extra,
  });
}

/** A CinePixo member who publishes reviews. */
export function memberNode(member: {
  username: string;
  displayName?: Nullable<string>;
  bio?: Nullable<string>;
  reviewCount?: Nullable<number>;
}): JsonLdNode {
  return compact({
    "@type": "Person",
    "@id": memberEntityId(member.username),
    name: member.displayName ?? member.username,
    alternateName: member.displayName ? member.username : undefined,
    description: clamp(member.bio ?? undefined, 300),
    memberOf: ref(ORG_ID),
    knowsAbout: ["film criticism", "movie reviews"],
  });
}

export interface CriticInput {
  slug: string;
  name: string;
  bio?: Nullable<string>;
  avatarUrl?: Nullable<string>;
  /** Off-site links; only http(s) URLs become `sameAs` identity claims. */
  links?: readonly { label: string; url: string }[];
}

/** A professional critic the fandom follows. */
export function criticNode(critic: CriticInput): JsonLdNode {
  const sameAs = (critic.links ?? [])
    .map((l) => l.url)
    .filter((u) => /^https?:\/\//i.test(u));
  return compact({
    "@type": "Person",
    "@id": criticEntityId(critic.slug),
    name: critic.name,
    url: absUrl(`/critics/${critic.slug}`),
    description: clamp(critic.bio ?? undefined, 400),
    image: critic.avatarUrl ?? undefined,
    jobTitle: "Film critic",
    knowsAbout: ["film criticism", "cinema"],
    sameAs,
    subjectOf: ref(pageId(`/critics/${critic.slug}`)),
  });
}

/* ─────────────────────────────── the film ─────────────────────────────── */

export interface MovieInput {
  id: string;
  /** URL identity — every public movie URL is built from this, never the id. */
  slug: string;
  title: string;
  originalTitle?: Nullable<string>;
  tagline?: Nullable<string>;
  overview?: Nullable<string>;
  posterPath?: Nullable<string>;
  backdropPath?: Nullable<string>;
  releaseDate?: Nullable<Date>;
  runtime?: Nullable<number>;
  director?: Nullable<string>;
  genres?: readonly string[];
  keywords?: readonly string[];
  countries?: readonly string[];
  certification?: Nullable<string>;
  imdbId?: Nullable<string>;
  homepage?: Nullable<string>;
  trailerKey?: Nullable<string>;
  collectionName?: Nullable<string>;
}

export interface MovieNodeOptions {
  // `personSlug`, where present, points the credit at that person's own page
  // instead of a bare fragment id — so a crawler resolves one Bong Joon-ho
  // across every film and review rather than a fresh stranger per page.
  cast?: readonly { name: string; character?: Nullable<string>; personSlug?: Nullable<string> }[];
  crew?: readonly { name: string; job: string; personSlug?: Nullable<string> }[];
  companies?: readonly { name: string }[];
  videos?: readonly {
    youtubeKey: string;
    name: string;
    type: string;
    publishedAt?: Nullable<Date>;
  }[];
  /** Fandom aggregate — pass only what the page actually displays. */
  fandom?: { averageStars: number; reviewCount: number } | null;
  /** `@id`s of review nodes present in the same graph. */
  reviewIds?: readonly string[];
  /** Reference-only node: identity plus name, for use from another page. */
  brief?: boolean;
}

const MPAA = new Set(["G", "PG", "PG-13", "R", "NC-17", "NR", "Unrated"]);

export function movieNode(movie: MovieInput, opts: MovieNodeOptions = {}): JsonLdNode {
  const id = movieEntityId(movie.slug);
  const url = absUrl(`/movies/${movie.slug}`);
  const poster = posterUrl(movie.posterPath, "w500");

  if (opts.brief) {
    return compact({ "@type": "Movie", "@id": id, name: movie.title, url, image: poster });
  }

  const crew = opts.crew ?? [];
  const byJob = (...jobs: string[]) =>
    crew.filter((c) => jobs.some((j) => c.job.toLowerCase() === j.toLowerCase()));

  // The director column and the crew table can disagree; the crew table wins,
  // and the column is the fallback for films imported before crew existed.
  const directors = byJob("Director");
  const directorNodes =
    directors.length > 0
      ? directors.map((d) => personNode(d.name, undefined, d.personSlug))
      : movie.director
        ? [personNode(movie.director)]
        : [];

  const writers = byJob("Screenplay", "Writer", "Story", "Screenwriter");
  const composers = byJob("Original Music Composer", "Music", "Composer");
  const photography = byJob("Director of Photography", "Cinematography");
  const editors = byJob("Editor", "Film Editor");

  const trailer = pickTrailer(movie, opts.videos);

  const sameAs = [
    movie.imdbId ? `https://www.imdb.com/title/${movie.imdbId}/` : undefined,
    movie.homepage ?? undefined,
  ].filter((u): u is string => Boolean(u));

  return compact({
    "@type": "Movie",
    "@id": id,
    url,
    name: movie.title,
    alternateName:
      movie.originalTitle && movie.originalTitle !== movie.title ? movie.originalTitle : undefined,
    description: clamp(movie.overview ?? movie.tagline ?? undefined, 500),
    disambiguatingDescription: movie.tagline ?? undefined,
    image: [posterUrl(movie.posterPath, "w780"), backdropUrl(movie.backdropPath)].filter(Boolean),
    thumbnailUrl: posterUrl(movie.posterPath, "w342"),
    datePublished: isoDay(movie.releaseDate),
    duration: isoDuration(movie.runtime),
    genre: movie.genres?.length ? [...movie.genres] : undefined,
    keywords: movie.keywords?.length ? movie.keywords.join(", ") : undefined,
    contentRating:
      movie.certification && MPAA.has(movie.certification)
        ? `MPAA ${movie.certification}`
        : (movie.certification ?? undefined),
    inLanguage: undefined, // not stored; asserting "en" for every film would lie
    countryOfOrigin: movie.countries?.map((name) => ({ "@type": "Country", name })),
    director: directorNodes,
    author: writers.map((w) => personNode(w.name, undefined, w.personSlug)),
    musicBy: composers.map((c) => personNode(c.name, undefined, c.personSlug)),
    // No schema.org property for a DoP or an editor; `contributor` is the
    // honest generic rather than misusing `creator`.
    contributor: [...photography, ...editors].map((c) =>
      personNode(c.name, undefined, c.personSlug),
    ),
    actor: opts.cast?.slice(0, 15).map((c) => personNode(c.name, undefined, c.personSlug)),
    productionCompany: opts.companies?.map((c) => ({ "@type": "Organization", name: c.name })),
    partOfSeries: movie.collectionName
      ? { "@type": "CreativeWorkSeries", name: movie.collectionName }
      : undefined,
    trailer,
    sameAs,
    aggregateRating: fandomRating(opts.fandom, url),
    review: opts.reviewIds?.map(ref),
    subjectOf: ref(pageId(`/movies/${movie.slug}`)),
  });
}

function pickTrailer(movie: MovieInput, videos: MovieNodeOptions["videos"]): JsonLdNode | undefined {
  const key =
    movie.trailerKey ??
    videos?.find((v) => v.type.toLowerCase() === "trailer")?.youtubeKey ??
    videos?.[0]?.youtubeKey;
  if (!key) return undefined;
  const meta = videos?.find((v) => v.youtubeKey === key);
  return compact({
    "@type": "VideoObject",
    name: meta?.name ?? `${movie.title} — trailer`,
    description: `Trailer for ${movie.title}.`,
    thumbnailUrl: youtubeThumb(key),
    embedUrl: youtubeEmbed(key),
    url: youtubeWatch(key),
    uploadDate: isoStamp(meta?.publishedAt) ?? isoDay(movie.releaseDate),
    inLanguage: SITE_LANG,
  });
}

/**
 * `aggregateRating` on the 0–5 star scale the page shows. Emitted only with at
 * least one real review: a rating claim with no ratings behind it is the
 * fastest way to lose rich results entirely.
 */
function fandomRating(
  fandom: MovieNodeOptions["fandom"],
  url: string,
): JsonLdNode | undefined {
  if (!fandom || fandom.reviewCount < 1) return undefined;
  return {
    "@type": "AggregateRating",
    ratingValue: Math.round(fandom.averageStars * 100) / 100,
    bestRating: 5,
    worstRating: 0,
    ratingCount: fandom.reviewCount,
    reviewCount: fandom.reviewCount,
    url,
  };
}

/* ─────────────────────────────── the review ─────────────────────────────── */

export interface ReviewInput {
  slug: string;
  title: string;
  excerpt?: Nullable<string>;
  verdict?: Nullable<string>;
  content: string;
  /** Raw 0–10 rating as stored. */
  rating: number;
  publishedAt?: Nullable<Date>;
  updatedAt?: Nullable<Date>;
  viewCount?: Nullable<number>;
  helpfulCount?: Nullable<number>;
  spoilers?: Nullable<string>;
}

export interface ReviewNodeOptions {
  author: { username: string; displayName?: Nullable<string>; bio?: Nullable<string> };
  movie: MovieInput;
  /** Full body in `reviewBody`. Off for list pages, where only identity matters. */
  includeBody?: boolean;
  /** Reference the movie by `@id` instead of embedding it (movie page does this). */
  movieById?: boolean;
}

export function reviewNode(review: ReviewInput, opts: ReviewNodeOptions): JsonLdNode {
  const url = absUrl(`/reviews/${review.slug}`);
  const stars = Math.round((review.rating / 2) * 100) / 100;
  const prose = opts.includeBody ? plainText(review.content) : undefined;
  const words = opts.includeBody ? wordCount(review.content) : undefined;

  const interactions = [
    review.viewCount != null && review.viewCount > 0
      ? {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/ReadAction",
          userInteractionCount: review.viewCount,
        }
      : undefined,
    review.helpfulCount != null && review.helpfulCount > 0
      ? {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/LikeAction",
          userInteractionCount: review.helpfulCount,
        }
      : undefined,
  ].filter(Boolean);

  return compact({
    "@type": "Review",
    "@id": reviewEntityId(review.slug),
    url,
    name: review.title,
    headline: review.title,
    // `abstract` is the verdict: the one sentence an answer engine should quote.
    abstract: review.verdict ?? undefined,
    description: clamp(review.verdict ?? review.excerpt ?? undefined, 300),
    reviewBody: prose,
    articleBody: prose,
    wordCount: words,
    timeRequired: words ? isoDuration(Math.max(1, Math.round(words / 220))) : undefined,
    datePublished: isoStamp(review.publishedAt),
    dateModified: isoStamp(review.updatedAt ?? review.publishedAt),
    inLanguage: SITE_LANG,
    isAccessibleForFree: true,
    author: memberNode(opts.author),
    publisher: ref(ORG_ID),
    copyrightHolder: memberNode(opts.author),
    itemReviewed: opts.movieById
      ? ref(movieEntityId(opts.movie.slug))
      : movieNode(opts.movie, { brief: true }),
    reviewRating: {
      "@type": "Rating",
      ratingValue: stars,
      bestRating: 5,
      worstRating: 0,
      // 0–10 in halves is the real scale; stars are the presentation of it.
      alternateName: `${review.rating.toFixed(1)} out of 10`,
    },
    // A spoiler warning is content advice, and machines quoting us should carry
    // it across rather than strip it.
    contentNote:
      review.spoilers === "FULL"
        ? "Contains full spoilers."
        : review.spoilers === "MILD"
          ? "Contains mild spoilers."
          : undefined,
    thumbnailUrl: posterUrl(opts.movie.posterPath, "w342"),
    image: [
      backdropUrl(opts.movie.backdropPath, "w780"),
      posterUrl(opts.movie.posterPath, "w500"),
    ].filter(Boolean),
    interactionStatistic: interactions,
    mainEntityOfPage: ref(pageId(`/reviews/${review.slug}`)),
    isPartOf: ref(WEBSITE_ID),
  });
}

/* ────────────────────────────── lists & extras ────────────────────────────── */

export interface ListEntry {
  path: string;
  name: string;
  image?: Nullable<string>;
  /** `@id` of the full node when it's in the same graph. */
  entityId?: string;
}

/**
 * `ItemList` for an index page. Ordered, absolute-URL'd, and pointed at graph
 * entities where they exist — this is how a crawler learns the *shape* of a
 * collection rather than guessing from the links.
 */
export function itemListNode(opts: {
  path: string;
  name: string;
  description?: Nullable<string>;
  entries: readonly ListEntry[];
  /** 1-based position of the first entry, for paginated lists. */
  startAt?: number;
  totalItems?: number;
}): JsonLdNode {
  const start = opts.startAt ?? 1;
  return compact({
    "@type": "ItemList",
    "@id": `${absUrl(opts.path)}#list`,
    name: opts.name,
    description: clamp(opts.description ?? undefined, 300),
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: opts.totalItems ?? opts.entries.length,
    itemListElement: opts.entries.map((e, i) =>
      compact({
        "@type": "ListItem",
        position: start + i,
        url: absUrl(e.path),
        name: e.name,
        image: e.image ?? undefined,
        item: e.entityId ? ref(e.entityId) : undefined,
      }),
    ),
  });
}

export function faqNode(path: string, qas: readonly { q: string; a: string }[]): JsonLdNode {
  return {
    "@type": "FAQPage",
    "@id": `${absUrl(path)}#faq`,
    mainEntity: qas.map((qa) => ({
      "@type": "Question",
      name: qa.q,
      acceptedAnswer: { "@type": "Answer", text: qa.a },
    })),
  };
}

/**
 * The stats page is a published dataset — genre averages, rating distribution,
 * fandom-vs-world deltas. Saying so makes it citable rather than decorative.
 */
export function datasetNode(opts: {
  path: string;
  name: string;
  description: string;
  variables: readonly string[];
  dateModified?: Nullable<Date | string>;
}): JsonLdNode {
  return compact({
    "@type": "Dataset",
    "@id": `${absUrl(opts.path)}#dataset`,
    name: opts.name,
    description: opts.description,
    url: absUrl(opts.path),
    creator: ref(ORG_ID),
    publisher: ref(ORG_ID),
    isAccessibleForFree: true,
    license: absUrl("/about"),
    inLanguage: SITE_LANG,
    dateModified: isoStamp(opts.dateModified),
    variableMeasured: opts.variables.map((name) => ({ "@type": "PropertyValue", name })),
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "text/markdown",
        contentUrl: absUrl("/llms-full.txt"),
      },
    ],
  });
}

/** Wrap nodes into one `@graph` document. One script tag per page, always. */
export function graph(...nodes: (JsonLdNode | undefined | false | null)[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter((n): n is JsonLdNode => Boolean(n)),
  };
}

/* ─────────────────────────────── page metadata ─────────────────────────────── */

export interface PageMetaInput {
  /** Canonical path, query string included when it is part of the identity. */
  path: string;
  title: string;
  description?: Nullable<string>;
  /** Bypass the `%s · CinePixo` template — the home page wants its own line. */
  absoluteTitle?: boolean;
  images?: readonly (string | { url: string; width?: number; height?: number; alt?: string })[];
  ogType?: "website" | "article" | "profile";
  keywords?: readonly string[];
  noIndex?: boolean;
  publishedTime?: Nullable<Date>;
  modifiedTime?: Nullable<Date>;
  authors?: readonly string[];
  section?: string;
  tags?: readonly string[];
  /** Clean-Markdown rendition, advertised as `rel=alternate`. */
  markdownPath?: string;
}

/**
 * Crawl directives for a page we do want indexed. Spelled out rather than left
 * to the defaults because the previews are the point: `max-image-preview:large`
 * is what lets a poster run full width in a result, and `max-snippet:-1` lets an
 * answer engine quote as much of a review as it needs to make the citation
 * worth following.
 */
export const INDEXABLE = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
} as const;

/** Excluded from the index, but still passing link equity outward. */
export const NOT_INDEXABLE = {
  index: false,
  follow: true,
  googleBot: { index: false, follow: true },
} as const;

/**
 * One place that decides canonical URL, Open Graph and Twitter card for every
 * page. Per-page objects drifted apart when this was done inline — a page would
 * get an `og:title` and no canonical, or a canonical and no image.
 *
 * Metadata merges *shallowly* in Next, one whole key at a time, so a page that
 * sets `alternates` at all replaces the layout's. That is why the feed links are
 * repeated here instead of being declared once in the root layout.
 */
export function pageMetadata(input: PageMetaInput): Metadata {
  const url = absUrl(input.path);
  const description = clamp(input.description ?? SITE_DESCRIPTION);
  const images = (input.images ?? []).map((i) => (typeof i === "string" ? { url: i } : i));

  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description,
    keywords: input.keywords?.length ? [...input.keywords] : undefined,
    alternates: {
      canonical: url,
      types: {
        "application/rss+xml": absUrl("/feed.xml"),
        "application/feed+json": absUrl("/feed.json"),
        ...(input.markdownPath ? { "text/markdown": absUrl(input.markdownPath) } : {}),
      },
    },
    robots: input.noIndex ? NOT_INDEXABLE : INDEXABLE,
    openGraph: {
      type: input.ogType ?? "website",
      url,
      title: input.title,
      description,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      images: images.length > 0 ? images : undefined,
      ...(input.ogType === "article"
        ? {
            publishedTime: isoStamp(input.publishedTime),
            modifiedTime: isoStamp(input.modifiedTime),
            authors: input.authors ? [...input.authors] : undefined,
            section: input.section,
            tags: input.tags ? [...input.tags] : undefined,
          }
        : {}),
    },
    twitter: {
      // Always the large card: a page with no image of its own still falls back
      // to app/opengraph-image.png via the file convention.
      card: "summary_large_image",
      title: input.title,
      description,
      images: images.length > 0 ? images.map((i) => i.url) : undefined,
    },
  };
}
