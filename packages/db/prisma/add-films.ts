// Grow the library from a curated list of titles.
//
//   npm run db:add-films
//
// The list below is the curation: twenty-one films a criticism audience argues
// about, spread across 1941–2019 and eight countries, chosen so the existing
// twelve axes gain films and the thinnest of them stop resting on two titles
// each. What the list is *not* is data — every field comes from TMDB at run time.
//
// Titles and years, not TMDB ids, because an id typed from memory is an id that
// silently imports the wrong film. Each entry is resolved by search and accepted
// only on an exact title match in the right year; anything ambiguous is reported
// and skipped rather than guessed.
//
// Idempotent and non-destructive: a film already in the library is left exactly
// as it is (its artwork and videos may have been curated since). Use the admin
// Refresh button, or db:refresh-library, to update one.
import "./env";
import { movieSlug } from "../../shared/src/index";
import { prisma } from "../src/index";
import { linkCreditsToPeople } from "../src/people-link";

const TOKEN = process.env.TMDB_ACCESS_TOKEN;
const KEY = process.env.TMDB_API_KEY;
if (!TOKEN && !KEY) {
  console.error(
    "No TMDB credential set (apps/web/.env.local): TMDB_ACCESS_TOKEN or TMDB_API_KEY.",
  );
  process.exit(1);
}

/** The curation. Order is only the order they are imported in. */
const FILMS: { title: string; year: number }[] = [
  { title: "Citizen Kane", year: 1941 },
  { title: "Rashomon", year: 1950 },
  { title: "Tokyo Story", year: 1953 },
  { title: "Seven Samurai", year: 1954 },
  { title: "Vertigo", year: 1958 },
  { title: "Taxi Driver", year: 1976 },
  { title: "Stalker", year: 1979 },
  { title: "Apocalypse Now", year: 1979 },
  { title: "Do the Right Thing", year: 1989 },
  { title: "Goodfellas", year: 1990 },
  { title: "In the Mood for Love", year: 2000 },
  { title: "Yi Yi", year: 2000 },
  { title: "Mulholland Drive", year: 2001 },
  { title: "City of God", year: 2002 },
  { title: "Memories of Murder", year: 2003 },
  { title: "There Will Be Blood", year: 2007 },
  { title: "No Country for Old Men", year: 2007 },
  { title: "Her", year: 2013 },
  { title: "Ex Machina", year: 2014 },
  { title: "Moonlight", year: 2016 },
  { title: "Portrait of a Lady on Fire", year: 2019 },
];

const KEY_CREW_JOBS = new Set([
  "Director",
  "Screenplay",
  "Writer",
  "Director of Photography",
  "Original Music Composer",
  "Editor",
  "Production Design",
]);
const VIDEO_TYPES = new Set(["Trailer", "Teaser", "Clip", "Featurette"]);

interface SearchHit {
  id: number;
  title: string;
  original_title: string;
  release_date: string | null;
}

interface Detail {
  id: number;
  imdb_id: string | null;
  title: string;
  original_title: string;
  tagline: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  runtime: number | null;
  budget: number;
  revenue: number;
  vote_average: number;
  vote_count: number;
  popularity: number;
  homepage: string | null;
  genres: { name: string }[];
  production_countries: { name: string }[];
  production_companies: { name: string; logo_path: string | null }[];
  belongs_to_collection: { id: number; name: string } | null;
  keywords?: { keywords: { name: string }[] };
  release_dates?: {
    results: { iso_3166_1: string; release_dates: { certification: string }[] }[];
  };
  external_ids?: { instagram_id?: string | null; facebook_id?: string | null; twitter_id?: string | null };
  credits?: {
    cast: { id: number; name: string; character: string | null; profile_path: string | null; order: number }[];
    crew: { id: number; name: string; job: string; department: string | null; profile_path: string | null }[];
  };
  videos?: {
    results: { key: string; name: string; site: string; type: string; official: boolean; published_at: string }[];
  };
  images?: {
    posters: { file_path: string; iso_639_1: string | null; vote_average: number }[];
    backdrops: { file_path: string; iso_639_1: string | null; vote_average: number }[];
  };
}

async function tmdb<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  if (!TOKEN) url.searchParams.set("api_key", KEY!);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined,
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/** Fold case, accents and punctuation, so "Yi Yi" matches "Yi yi". */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * The one film that is unambiguously the one asked for, or null.
 *
 * The year is a filter, not an assertion: TMDB's primary release date is
 * whichever national release came first, so a film everyone dates to 2014 can
 * sit under 2015. A year either side is accepted, with the exact year preferred,
 * and the title still has to match exactly once folded. Two exact matches is a
 * real ambiguity (same-year remakes exist) — refuse rather than pick.
 */
async function resolve(title: string, year: number): Promise<SearchHit | null> {
  const { results } = await tmdb<{ results: SearchHit[] }>("/search/movie", {
    query: title,
    include_adult: "false",
  });
  const wanted = fold(title);
  const exact = results.filter(
    (r) => fold(r.title) === wanted || fold(r.original_title) === wanted,
  );
  const yearOf = (r: SearchHit) => Number(r.release_date?.slice(0, 4) ?? 0);
  for (const tolerance of [0, 1]) {
    const near = exact.filter((r) => Math.abs(yearOf(r) - year) <= tolerance);
    if (near.length === 1) return near[0];
    if (near.length > 1) return null;
  }
  return null;
}

function certification(d: Detail): string | null {
  const us = d.release_dates?.results.find((r) => r.iso_3166_1 === "US");
  return us?.release_dates.find((rd) => rd.certification)?.certification || null;
}

const socialHandle = (v: string | null | undefined) =>
  v && /^[A-Za-z0-9._-]{1,60}$/.test(v) ? v : null;
const httpUrl = (v: string | null | undefined) =>
  v && /^https?:\/\//.test(v) ? v.slice(0, 500) : null;

/** A slug nobody else holds. Minted once, on first import, and never rewritten. */
async function mintSlug(title: string, releaseDate: Date | null, tmdbId: number) {
  const candidate = movieSlug(title, releaseDate);
  let slug = candidate;
  for (let n = 2; ; n++) {
    const holder = await prisma.movie.findUnique({ where: { slug }, select: { tmdbId: true } });
    if (!holder || holder.tmdbId === tmdbId) return slug;
    slug = `${candidate}-${n}`;
  }
}

async function importFilm(
  hit: SearchHit,
): Promise<{ title: string; slug: string; cast: number; crew: number }> {
  const d = await tmdb<Detail>(`/movie/${hit.id}`, {
    append_to_response: "credits,videos,images,keywords,release_dates,external_ids",
    include_image_language: "en,null",
  });

  const releaseDate = d.release_date ? new Date(d.release_date) : null;
  const data = {
    imdbId: d.imdb_id ?? null,
    title: d.title,
    originalTitle: d.original_title,
    tagline: d.tagline || null,
    overview: d.overview || null,
    posterPath: d.poster_path,
    backdropPath: d.backdrop_path,
    releaseDate,
    runtime: d.runtime && d.runtime > 0 ? d.runtime : null,
    director: d.credits?.crew.find((c) => c.job === "Director")?.name ?? null,
    genres: d.genres.map((g) => g.name),
    keywords: (d.keywords?.keywords ?? []).slice(0, 15).map((k) => k.name),
    countries: d.production_countries.map((c) => c.name),
    certification: certification(d),
    // TMDB uses 0 for "unknown"; the CHECK constraints and the page both want
    // NULL for that, so an unknown budget never renders as "$0".
    budget: d.budget > 0 ? d.budget : null,
    revenue: d.revenue > 0 ? d.revenue : null,
    voteAverage: d.vote_average > 0 ? d.vote_average : null,
    voteCount: d.vote_count > 0 ? d.vote_count : null,
    popularity: d.popularity > 0 ? d.popularity : null,
    collectionId: d.belongs_to_collection?.id ?? null,
    collectionName: d.belongs_to_collection?.name ?? null,
    companies: d.production_companies.slice(0, 8).map((c) => ({ name: c.name, logoPath: c.logo_path })),
    homepage: httpUrl(d.homepage),
    instagram: socialHandle(d.external_ids?.instagram_id),
    facebook: socialHandle(d.external_ids?.facebook_id),
    twitter: socialHandle(d.external_ids?.twitter_id),
  };

  const cast = (d.credits?.cast ?? []).slice(0, 20);
  const seenCrew = new Set<string>();
  const crew = (d.credits?.crew ?? [])
    .filter((c) => KEY_CREW_JOBS.has(c.job))
    .filter((c) => {
      const k = `${c.id}:${c.job}`;
      if (seenCrew.has(k)) return false;
      seenCrew.add(k);
      return true;
    })
    .slice(0, 12);

  const rank = (type: string, official: boolean) =>
    (type === "Trailer" ? 3 : type === "Teaser" ? 2 : type === "Clip" ? 1 : 0) + (official ? 1 : 0);
  const seenVideos = new Set<string>();
  const videos = (d.videos?.results ?? [])
    .filter((v) => v.site === "YouTube" && VIDEO_TYPES.has(v.type))
    .filter((v) => (seenVideos.has(v.key) ? false : (seenVideos.add(v.key), true)))
    .sort(
      (a, b) =>
        rank(b.type, b.official) - rank(a.type, a.official) ||
        (b.published_at ?? "").localeCompare(a.published_at ?? ""),
    )
    .slice(0, 8);

  const pick = <T extends { vote_average: number }>(list: T[] | undefined, n: number) =>
    (list ?? []).slice().sort((a, b) => b.vote_average - a.vote_average).slice(0, n);
  const artwork = [
    ...pick(d.images?.posters, 10).map((p, i) => ({
      kind: "poster" as const,
      path: p.file_path,
      lang: p.iso_639_1,
      sort: i,
    })),
    ...pick(d.images?.backdrops, 8).map((b, i) => ({
      kind: "backdrop" as const,
      path: b.file_path,
      lang: b.iso_639_1,
      sort: i,
    })),
  ];

  const slug = await mintSlug(d.title, releaseDate, d.id);

  await prisma.$transaction(async (tx) => {
    const movie = await tx.movie.create({
      data: { tmdbId: d.id, slug, trailerKey: videos[0]?.key ?? null, ...data },
    });
    if (cast.length > 0) {
      await tx.movieCast.createMany({
        data: cast.map((c) => ({
          movieId: movie.id,
          tmdbPersonId: c.id,
          name: c.name,
          character: c.character,
          profilePath: c.profile_path,
          order: c.order,
        })),
      });
    }
    if (crew.length > 0) {
      await tx.movieCrew.createMany({
        data: crew.map((c) => ({
          movieId: movie.id,
          tmdbPersonId: c.id,
          name: c.name,
          job: c.job,
          department: c.department,
          profilePath: c.profile_path,
        })),
      });
    }
    if (videos.length > 0) {
      await tx.movieVideo.createMany({
        data: videos.map((v, i) => ({
          movieId: movie.id,
          youtubeKey: v.key,
          name: v.name ?? v.type,
          type: v.type,
          official: v.official,
          publishedAt: v.published_at ? new Date(v.published_at) : null,
          sort: i,
        })),
      });
    }
    if (artwork.length > 0) {
      await tx.movieImage.createMany({ data: artwork.map((a) => ({ movieId: movie.id, ...a })) });
    }
    // Credits become people we own: this claims an already-enriched Person row
    // by name rather than duplicating it, which is what makes a new film's cast
    // link straight to portraits we already have.
    await linkCreditsToPeople(tx, movie.id);
  });

  return {
    title: `${d.title} (${releaseDate?.getUTCFullYear() ?? "—"})`,
    slug,
    cast: cast.length,
    crew: crew.length,
  };
}

async function main() {
  let added = 0;
  const skipped: string[] = [];
  const unresolved: string[] = [];

  for (const wanted of FILMS) {
    const label = `${wanted.title} (${wanted.year})`;
    const hit = await resolve(wanted.title, wanted.year);
    if (!hit) {
      unresolved.push(label);
      console.warn(`?  ${label} — no single exact match on TMDB, skipped`);
      continue;
    }

    const existing = await prisma.movie.findUnique({
      where: { tmdbId: hit.id },
      select: { slug: true },
    });
    if (existing) {
      skipped.push(label);
      console.log(`=  ${label} — already in the library (/movies/${existing.slug})`);
      continue;
    }

    const done = await importFilm(hit);
    added += 1;
    // The slug is printed because it is the film's public identity from now on,
    // and because the topic seed matches on title and year — a title TMDB spells
    // differently is visible here rather than as a silently skipped assignment.
    console.log(`+  ${done.title} — /movies/${done.slug} — ${done.cast} cast, ${done.crew} crew`);
    // Well under TMDB's rate limit, and this runs twice per film.
    await new Promise((r) => setTimeout(r, 300));
  }

  const total = await prisma.movie.count();
  console.log(
    `\nAdded ${added}, already present ${skipped.length}, unresolved ${unresolved.length}. Library: ${total} films.`,
  );
  if (unresolved.length > 0) {
    console.warn(`Unresolved: ${unresolved.join("; ")} — import these by hand from /admin/movies.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
