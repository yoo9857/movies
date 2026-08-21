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

/**
 * Retired (2026-07-31, owner's decision): the site no longer serves or cites
 * TMDB imagery — artwork is our own (Commons-licensed files on our origin) or
 * the house card. The stored `posterPath` columns remain as historical import
 * data, but no URL is ever built from them again. The function keeps its shape
 * so every caller — JSON-LD, sitemaps, feeds, share cards — goes quiet at this
 * one choke point instead of forty call sites.
 */
export function tmdbImage(_path: Nullable<string>, _size: TmdbSize): string | undefined {
  void _path;
  void _size;
  return undefined;
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
    // A photo credit whole, before links are flattened. Otherwise the caption
    // survives into feed summaries as "Photo: Someone · CC BY-SA 4.0 · source"
    // — an attribution stripped of the URL that makes it checkable, and, for a
    // post that opens on a picture, the first thing a reader sees of it.
    .replace(/^\s{0,3}\*Photos?:[\s\S]*?\*\s*$/gm, " ")
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

/**
 * ISO-8601 instant, always with a zone (`toISOString` ends in `Z`).
 *
 * Not interchangeable with `isoDay`: schema.org properties typed `DateTime` —
 * `VideoObject.uploadDate` above all — are validated as a *moment*, and a bare
 * "1954-07-28" fails twice over. Search Console reported exactly that against
 * this site: "uploadDate의 datetime 값이 잘못됨" and "시간대가 누락됨" are one
 * bug, a date where an instant belongs. `Date` properties like a film's
 * `datePublished` are the opposite case and keep `isoDay`.
 */
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
/** The one image a page leads with, described once and pointed at from both. */
export const primaryImageId = (path: string) => `${absUrl(path)}#primaryimage`;
export const movieEntityId = (slug: string) => `${SITE_URL}/movies/${slug}#movie`;
export const reviewEntityId = (slug: string) => `${SITE_URL}/reviews/${slug}#review`;
export const criticEntityId = (slug: string) => `${SITE_URL}/critics/${slug}#person`;

const nameSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";

/** A publishing member's public profile owns their identity. */
export const memberEntityId = (username: string) =>
  `${SITE_URL}/writers/${username}#person`;

/** Cast, crew and directors: no page either, but a shared id de-duplicates a
 *  writer-director across the `director` and `author` slots of one film. */
export const personEntityId = (name: string) => `${SITE_URL}/#/schema/person/${nameSlug(name)}`;

/** A person we have a page for. Their page owns their identity. */
export const peopleEntityId = (slug: string) => `${SITE_URL}/people/${slug}#person`;

/** An editorial topic or motif. Its page owns the term. */
export const topicEntityId = (slug: string) => `${SITE_URL}/topics/${slug}#term`;

/** The taxonomy itself — the set every topic term belongs to. */
export const TOPIC_SET_ID = `${SITE_URL}/topics#termset`;

/** The blog as a publication. Every post is `isPartOf` this one node. */
export const BLOG_ID = `${SITE_URL}/blog#blog`;

/** A blog post. Its page owns it, exactly as a review's page owns the review. */
export const postEntityId = (slug: string) => `${SITE_URL}/blog/${slug}#post`;

/* ──────────────────────────────── images ──────────────────────────────── */
//
// Google's image-metadata feature reads five properties off an `ImageObject` —
// `creator`, `creditText`, `copyrightNotice`, `license` and
// `acquireLicensePage` — and Search Console reports the missing ones as
// non-critical issues. This site published two of the five and was reported for
// the other three on 2026-08-07.
//
// All five come off the four `image*` columns a licensed file already carries,
// so they are derived in one place rather than at each call site. Two of them
// are a pair and are treated as one: `license` is the deed (what the terms
// *are*) and `acquireLicensePage` is the file's own page (where a reader goes
// to reuse it). An operator's own upload states no licence, so it stays a plain
// image URL instead of becoming a partial ImageObject. That is the honest
// answer and keeps an unlicensable file out of the image-metadata report.

/**
 * Where the terms for a picture on this site are written down: the artwork
 * section of the terms of use, which names the rights holder for each kind of
 * file we show. `acquireLicensePage` for our own work is `/contact`, because
 * asking is how you acquire it.
 */
export const IMAGE_TERMS_PATH = "/terms#artwork";

export interface ImageInput {
  /** Stored form — a site path or a bucket URL. `hosted()` is applied here. */
  url: Nullable<string>;
  /** Graph identity, so one page describes one file exactly once. */
  id?: string;
  /** What the picture shows. The page prints it as alt text and a caption. */
  caption?: Nullable<string>;
  /** The attribution line, as rendered. */
  credit?: Nullable<string>;
  /**
   * `@id` of the creator's node, for a file we made ourselves. Wins over the
   * name parsed out of `credit`: our own artwork has an Organization in this
   * graph already, and a reference beats a second copy of its name.
   */
  creatorId?: string;
  /** Licence short name as the page prints it, e.g. "CC BY-SA 4.0". */
  license?: Nullable<string>;
  licenseUrl?: Nullable<string>;
  /** Where the file lives: the Commons page, the archive's record. */
  sourceUrl?: Nullable<string>;
  width?: Nullable<number>;
  height?: Nullable<number>;
}

export function hasCompleteImageMetadata(
  input: Pick<ImageInput, "url" | "licenseUrl" | "sourceUrl">,
): boolean {
  return Boolean(input.url?.trim() && input.licenseUrl?.trim() && input.sourceUrl?.trim());
}

export function imageObjectNode(input: ImageInput): JsonLdNode | undefined {
  const url = hosted(input.url);
  const license = input.licenseUrl?.trim() || undefined;
  const acquireLicensePage = input.sourceUrl?.trim() || undefined;

  // Google's image-metadata enhancement treats every ImageObject as a
  // licensable image and reports these two URL properties independently. They
  // are also a semantic pair: a deed without the file page cannot tell a
  // reader how the terms apply to this particular copy. Keep unlicensed or
  // incomplete records as plain image URLs at the call site instead of
  // emitting an ImageObject that is guaranteed to be incomplete.
  if (!hasCompleteImageMetadata(input) || !url || !license || !acquireLicensePage) return undefined;
  const credit = input.credit?.trim() || undefined;
  const notice = creditIsNotice(credit);
  const holder = notice ? undefined : creditedName(credit);

  return compact({
    "@type": "ImageObject",
    "@id": input.id,
    url,
    contentUrl: url,
    caption: input.caption ?? undefined,
    width: input.width ?? undefined,
    height: input.height ?? undefined,
    creditText: credit,
    // A credit written as "© …" names a rights holder, and a rights holder is
    // not an author: 80,000 posters here are credited to "the film's rights
    // holders", which as a `creator.name` would be a sentence pretending to be
    // a person. It is a copyright notice and nothing else.
    creator: input.creatorId
      ? ref(input.creatorId)
      : holder
        ? { "@type": ORGANISATION_CREDIT.test(holder) ? "Organization" : "Person", name: holder }
        : undefined,
    copyrightNotice: notice ? credit : copyrightNotice(holder, input.license, input.licenseUrl),
    license,
    // A licence and the page it is acquired from are one obligation, and the
    // test is the deed, not the licence *column*: "Poster shown for
    // identification" is a use we claim, not terms anyone can take up, and
    // pointing `acquireLicensePage` at a Wikipedia article would offer a licence
    // that does not exist. No deed, no acquisition.
    acquireLicensePage,
  });
}

/**
 * A credit line is a caption's grammar wrapped around a name: "Photograph by
 * Someone", "Someone / YouTube". The name is what `creator` wants.
 */
const CREDIT_PREFIX = /^(photo(graph)?s?|image|picture|still)s?\s*(by\s+|[:—-]\s*)/i;

/**
 * Choosing `Person` or `Organization` for a free-text credit is a guess, so it
 * is made the way the data leans: a photo credit names a photographer far more
 * often than a body, and the exceptions are the ones a legal suffix or an
 * institution word makes unambiguous.
 */
const ORGANISATION_CREDIT =
  /\b(inc|llc|ltd|plc|gmbh|corp|corporation|company|studios?|pictures|films?|productions?|entertainment|photography|media|press|news|agency|agence|archives?|librar(y|ies)|museums?|foundations?|institutes?|universit(y|ies)|ministry|department|bureau|councils?|festivals?|networks?|broadcasting|television|records|associated|reuters|getty|shutterstock|nasa|wikimedia|commons|youtube)\b/i;

/**
 * Is this credit a copyright notice rather than a byline?
 *
 * "© the film's rights holders" and "Gage Skidmore" are both credits and are
 * not the same claim: the first says who owns the picture, the second says who
 * made it. Callers need the distinction too — a page that writes "Poster by ©
 * the film's rights holders" has not read its own data.
 */
export const creditIsNotice = (credit: Nullable<string>): boolean =>
  Boolean(credit && /^\s*(©|\(c\)|copyright\b)/i.test(credit));

/** The name inside a credit line: who took it, stripped of the grammar. */
function creditedName(credit: string | undefined): string | undefined {
  if (!credit) return undefined;
  // Our own credit builders join the author to the platform with " / "; the
  // author is the half that is a creator. A spaced slash, so "AC/DC" survives.
  return credit.split(" / ")[0].replace(CREDIT_PREFIX, "").replace(/^©\s*/, "").trim() || undefined;
}

/**
 * The credit, in the form the property asks for: "© <holder>". Not a new claim
 * — under a CC licence the copyright holder *is* the credited author, and the
 * page prints that name already.
 *
 * A public-domain file gets none. A © over a work nobody owns would be worse
 * than the missing field Search Console reported.
 */
const PUBLIC_DOMAIN = /(public\s*domain|\bpdm\b|\bcc0\b|no known copyright)/i;

function copyrightNotice(
  holder: string | undefined,
  license: Nullable<string>,
  licenseUrl: Nullable<string>,
): string | undefined {
  if (!holder) return undefined;
  if (license && PUBLIC_DOMAIN.test(license)) return undefined;
  if (licenseUrl && /creativecommons\.org\/publicdomain\//i.test(licenseUrl)) return undefined;
  return /©|\(c\)|copyright/i.test(holder) ? holder : `© ${holder}`;
}

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
    // The one image on every page of the site, and so the one Google's image
    // metadata report counts once per URL: it was reported on 2026-08-07 for
    // the three properties below that were missing. Our own mark, made here,
    // owned here, licensed on request — which is a thing the terms page says
    // and this now points at.
    logo: imageObjectNode({
      id: LOGO_ID,
      url: "/logo.png",
      caption: SITE_NAME,
      width: 256,
      height: 256,
      credit: SITE_NAME,
      creatorId: ORG_ID,
      license: "All rights reserved",
      licenseUrl: absUrl(IMAGE_TERMS_PATH),
      sourceUrl: absUrl("/contact"),
    }),
    image: ref(LOGO_ID),
    sameAs: SOCIAL_PROFILES,
    knowsAbout: SITE_KEYWORDS,
    // The rating rules are published, not implied — an answer engine that cites
    // one of our scores can find out exactly what the number means.
    publishingPrinciples: absUrl("/editorial"),
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
  | "ContactPage"
  | "ProfilePage"
  | "SearchResultsPage";

export interface WebPageInput {
  path: string;
  name: string;
  description?: Nullable<string>;
  kind?: PageKind;
  image?: Nullable<string>;
  /**
   * `@id` of an `imageObjectNode` for that same file, when the graph carries
   * one. Preferred over `image`: two nodes describing one picture is how a
   * complete description gets read as an incomplete one, and only the fully
   * described node has the credit and the licence on it.
   */
  imageId?: string;
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
    // `primaryImageOfPage` only points at a fully described ImageObject in the
    // same graph. A bare image remains useful through `image`, whose URL form
    // does not claim the licensing metadata an ImageObject promises.
    primaryImageOfPage: input.imageId ? ref(input.imageId) : undefined,
    image: !input.imageId && input.image ? input.image : undefined,
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
  avatarUrl?: Nullable<string>;
  reviewCount?: Nullable<number>;
}): JsonLdNode {
  const path = `/writers/${member.username}`;
  const desk = member.username === "cinepixo";
  return compact({
    "@type": desk ? "Organization" : "Person",
    "@id": memberEntityId(member.username),
    url: absUrl(path),
    name: member.displayName ?? member.username,
    alternateName: member.displayName ? member.username : undefined,
    description: clamp(member.bio ?? undefined, 300),
    image: hosted(member.avatarUrl),
    mainEntityOfPage: ref(pageId(path)),
    memberOf: desk ? undefined : ref(ORG_ID),
    parentOrganization: desk ? ref(ORG_ID) : undefined,
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
  /** A trailer on our own storage. Preferred by the page, so preferred here. */
  trailerFile?: Nullable<string>;
  trailerFileDuration?: Nullable<number>;
  image?: Nullable<string>;
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
  /**
   * `@id`s of the DefinedTerms this film carries — `topicEntityId(slug)`.
   *
   * References only, never inline nodes: the definition of a theme is rendered
   * on the topic's own page, not here, and the rule is that a page never claims
   * what it does not show. The `@id` is what lets a crawler follow the axis to
   * the page that does define it.
   */
  topicIds?: readonly string[];
  /** Reference-only node: identity plus name, for use from another page. */
  brief?: boolean;
}

const MPAA = new Set(["G", "PG", "PG-13", "R", "NC-17", "NR", "Unrated"]);

export function movieNode(movie: MovieInput, opts: MovieNodeOptions = {}): JsonLdNode {
  const id = movieEntityId(movie.slug);
  const url = absUrl(`/movies/${movie.slug}`);
  // Our own poster first. `posterUrl` has answered undefined since TMDB paths
  // stopped being handed to browsers, which quietly left every Movie node in
  // the graph imageless — and `image` is what review snippets and movie rich
  // results key on. The file in `movie.image` is the poster the page renders.
  const poster = hosted(movie.image ?? null) ?? posterUrl(movie.posterPath, "w500");

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
    image: [
      hosted(movie.image ?? null),
      posterUrl(movie.posterPath, "w780"),
      backdropUrl(movie.backdropPath),
    ].filter(Boolean),
    thumbnailUrl: poster,
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
    // Our taxonomy, not TMDB's keyword list: `keywords` above carries the
    // imported strings, `about` carries the axes we argued for by hand.
    about: opts.topicIds?.length ? opts.topicIds.map(ref) : undefined,
    subjectOf: ref(pageId(`/movies/${movie.slug}`)),
  });
}

/**
 * Our own file, as an absolute URL. Both storage drivers land in these columns:
 * the local one writes `/uploads/…`, the bucket writes its own https URL — and
 * running `absUrl` over the second would produce `https://cinepixo.com/https://…`.
 */
export function hosted(url: string): string;
export function hosted(url: Nullable<string>): string | undefined;
export function hosted(url: Nullable<string>): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//.test(url) ? url : absUrl(url);
}

function pickTrailer(movie: MovieInput, videos: MovieNodeOptions["videos"]): JsonLdNode | undefined {
  // The page prefers our own file over the YouTube embed, and the graph has to
  // describe the video a visitor is actually offered — a VideoObject pointing
  // at an embed the page no longer renders is precisely the drift this file
  // exists to prevent.
  if (movie.trailerFile) {
    const uploadDate = isoStamp(movie.releaseDate);
    // An unknown date cannot be represented as a valid DateTime. Keep the
    // playable trailer on the page, but omit its VideoObject until provenance
    // supplies a date rather than emitting a rich-result error.
    if (!uploadDate) return undefined;
    return compact({
      "@type": "VideoObject",
      name: `${movie.title} — trailer`,
      description: `Trailer for ${movie.title}.`,
      thumbnailUrl: movie.image ? hosted(movie.image) : undefined,
      contentUrl: hosted(movie.trailerFile),
      // Seconds here, unlike `runtime`'s minutes.
      duration: movie.trailerFileDuration
        ? isoDuration(Math.round(movie.trailerFileDuration / 60))
        : undefined,
      uploadDate,
      inLanguage: SITE_LANG,
    });
  }

  const key =
    movie.trailerKey ??
    videos?.find((v) => v.type.toLowerCase() === "trailer")?.youtubeKey ??
    videos?.[0]?.youtubeKey;
  if (!key) return undefined;
  const meta = videos?.find((v) => v.youtubeKey === key);
  const uploadDate = isoStamp(meta?.publishedAt) ?? isoStamp(movie.releaseDate);
  if (!uploadDate) return undefined;
  return compact({
    "@type": "VideoObject",
    name: meta?.name ?? `${movie.title} — trailer`,
    description: `Trailer for ${movie.title}.`,
    thumbnailUrl: youtubeThumb(key),
    embedUrl: youtubeEmbed(key),
    url: youtubeWatch(key),
    uploadDate,
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
      hosted(opts.movie.image),
      backdropUrl(opts.movie.backdropPath, "w780"),
      posterUrl(opts.movie.posterPath, "w500"),
    ].filter(Boolean),
    interactionStatistic: interactions,
    mainEntityOfPage: ref(pageId(`/reviews/${review.slug}`)),
    isPartOf: ref(WEBSITE_ID),
  });
}

/* ─────────────────────────────── topics ─────────────────────────────── */

/**
 * The taxonomy as schema.org sees it: one `DefinedTermSet` for the site's
 * editorial axes, one `DefinedTerm` per topic. This is the vocabulary a
 * crawler can cite — "class divide, as CinePixo defines it" — which is what
 * an in-house taxonomy is for.
 */
export function definedTermSetNode(): JsonLdNode {
  return compact({
    "@type": "DefinedTermSet",
    "@id": TOPIC_SET_ID,
    name: `${SITE_NAME} Topics & Motifs`,
    description:
      "The editorial axes of the library: themes a film is about and motifs that recur on screen, defined and assigned by the fandom.",
    url: absUrl("/topics"),
    publisher: ref(ORG_ID),
  });
}

export function definedTermNode(topic: {
  slug: string;
  name: string;
  kind: "THEME" | "MOTIF";
  description?: Nullable<string>;
}): JsonLdNode {
  return compact({
    "@type": "DefinedTerm",
    "@id": topicEntityId(topic.slug),
    name: topic.name,
    description: topic.description ?? undefined,
    // "termCode" carries the kind, so THEME and MOTIF stay distinguishable
    // to a consumer that never reads our prose.
    termCode: topic.kind,
    url: absUrl(`/topics/${topic.slug}`),
    inDefinedTermSet: ref(TOPIC_SET_ID),
  });
}

/* ─────────────────────────────── the blog ─────────────────────────────── */

/**
 * The blog as a publication in its own right.
 *
 * One `Blog` node every post hangs off, rather than a bare `Article` per page.
 * The difference matters to the audience this file exists for: a crawler that
 * sees forty unconnected articles has forty pages, while one that sees a Blog
 * with forty `blogPost`s has a publication with an editorial line — which is
 * what gets a piece surfaced as "CinePixo reported" instead of as a stray URL.
 */
export function blogNode(): JsonLdNode {
  return compact({
    "@type": "Blog",
    "@id": BLOG_ID,
    url: absUrl("/blog"),
    name: `${SITE_NAME} — Off Camera`,
    description:
      "Film writing that isn't a review: the people who make films away from the film, the arguments the industry is having, and what to watch next.",
    inLanguage: SITE_LANG,
    publisher: ref(ORG_ID),
    isPartOf: ref(WEBSITE_ID),
  });
}

export interface PostInput {
  slug: string;
  title: string;
  dek?: Nullable<string>;
  content: string;
  /** The `PostCategory` label as the page prints it, not the enum member. */
  categoryLabel: string;
  /** The reader-facing job: comparison, checklist, first-hand guide, etc. */
  formatLabel?: string;
  tags?: readonly string[];
  /** Source URLs — every one of which the page renders. */
  sources?: readonly string[];
  publishedAt?: Nullable<Date>;
  updatedAt?: Nullable<Date>;
  viewCount?: Nullable<number>;
  /** Our own hero object, as stored (a path or a bucket URL). */
  image?: Nullable<string>;
  imageAlt?: Nullable<string>;
  imageCredit?: Nullable<string>;
  imageLicense?: Nullable<string>;
  imageLicenseUrl?: Nullable<string>;
  /** The file's own page — printed under the hero, linked from the credit. */
  imageSourceUrl?: Nullable<string>;
}

export interface PostNodeOptions {
  author: { username: string; displayName?: Nullable<string>; bio?: Nullable<string> };
  /** Full body in `articleBody`. Off for list pages, where identity is enough. */
  includeBody?: boolean;
  /**
   * What the piece is about, in the order the page presents it. The first entry
   * becomes `about`; the rest become `mentions` — which is the honest reading of
   * a curated `sort` column, and keeps a piece on one actor from claiming to be
   * equally about the six films listed under it.
   */
  subjectIds?: readonly string[];
}

export function postNode(post: PostInput, opts: PostNodeOptions): JsonLdNode {
  const path = `/blog/${post.slug}`;
  const prose = opts.includeBody ? plainText(post.content) : undefined;
  const words = opts.includeBody ? wordCount(post.content) : undefined;
  const [primary, ...rest] = opts.subjectIds ?? [];
  const image = imageObjectNode({
    id: primaryImageId(path),
    url: post.image,
    caption: post.imageAlt,
    credit: post.imageCredit,
    license: post.imageLicense,
    licenseUrl: post.imageLicenseUrl,
    sourceUrl: post.imageSourceUrl,
  });

  return compact({
    "@type": "BlogPosting",
    "@id": postEntityId(post.slug),
    url: absUrl(path),
    // Google truncates a headline past ~110 characters; the column allows 200,
    // so this is clamped rather than trusted.
    headline: clamp(post.title, 110),
    name: post.title,
    // The standfirst is the sentence written to be quoted out of context, so it
    // is both the abstract and the description.
    abstract: post.dek ?? undefined,
    description: clamp(post.dek ?? undefined, 300),
    articleBody: prose,
    wordCount: words,
    timeRequired: words ? isoDuration(Math.max(1, Math.round(words / 220))) : undefined,
    datePublished: isoStamp(post.publishedAt),
    dateModified: isoStamp(post.updatedAt ?? post.publishedAt),
    inLanguage: SITE_LANG,
    isAccessibleForFree: true,
    articleSection: post.categoryLabel,
    genre: post.formatLabel,
    keywords: post.tags?.length ? post.tags.join(", ") : undefined,
    author: memberNode(opts.author),
    publisher: ref(ORG_ID),
    copyrightHolder: ref(ORG_ID),
    about: primary ? ref(primary) : undefined,
    mentions: rest.length > 0 ? rest.map(ref) : undefined,
    // The sources line, as a machine can read it. This is the part that makes a
    // claim about a living person checkable rather than merely asserted — and
    // every URL here is printed on the page, which is the rule for this file.
    citation: post.sources?.length
      ? post.sources.map((url) => ({ "@type": "CreativeWork", url }))
      : undefined,
    // Credit and licence travel with a free file wherever it is described,
    // markup included — the page renders the same strings under the picture.
    image: image ?? hosted(post.image),
    interactionStatistic:
      post.viewCount != null && post.viewCount > 0
        ? {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/ReadAction",
            userInteractionCount: post.viewCount,
          }
        : undefined,
    isPartOf: ref(BLOG_ID),
    mainEntityOfPage: ref(pageId(path)),
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
  /**
   * Section feeds this page belongs to, offered ahead of the site feed —
   * a reader subscribing from a blog page wants the blog.
   */
  feeds?: readonly { path: string; title: string }[];
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
        // A section's own feed is listed first so a reader subscribing from
        // inside the blog gets the blog, not the whole site. Both are offered:
        // a feed reader shows the list, and dropping the site feed here would
        // make the blog the only way to subscribe from a blog page.
        "application/rss+xml": input.feeds?.length
          ? [
              ...input.feeds.map((f) => ({ url: absUrl(f.path), title: f.title })),
              { url: absUrl("/feed.xml"), title: `${SITE_NAME} — everything` },
            ]
          : absUrl("/feed.xml"),
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
      // The key is *omitted*, never set to undefined. File-based metadata has
      // higher priority than this object — but only if the key is absent: a
      // present `images: undefined` reads as "this page declares no image" and
      // suppresses the convention. That one line meant most of the site shipped
      // with no og:image at all, static fallback included, for its whole life.
      ...(images.length > 0 ? { images } : {}),
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
      // Always the large card. Same omission rule as openGraph above: with no
      // `images` key, a page inherits its segment's generated card, or the
      // site-wide app/opengraph-image.png.
      card: "summary_large_image",
      title: input.title,
      description,
      ...(images.length > 0 ? { images: images.map((i) => i.url) } : {}),
    },
  };
}
