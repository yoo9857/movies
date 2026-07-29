// Server-only TMDB client. The API key never reaches the browser —
// admin UI talks to our own /api/v1/admin/tmdb/* routes instead.
import { ApiError } from "./api";

const TMDB_BASE = "https://api.themoviedb.org/3";

export interface TmdbMovieSummary {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
}

export interface TmdbMovieDetail extends TmdbMovieSummary {
  imdb_id: string | null;
  tagline: string | null;
  homepage: string | null;
  runtime: number | null;
  budget: number;
  revenue: number;
  vote_count: number;
  popularity: number;
  genres: { id: number; name: string }[];
  production_countries: { iso_3166_1: string; name: string }[];
  production_companies: { id: number; name: string; logo_path: string | null }[];
  belongs_to_collection: { id: number; name: string; poster_path: string | null } | null;
  external_ids?: {
    instagram_id: string | null;
    facebook_id: string | null;
    twitter_id: string | null;
  };
  images?: {
    posters: { file_path: string; iso_639_1: string | null; vote_average: number }[];
    backdrops: { file_path: string; iso_639_1: string | null; vote_average: number }[];
  };
  credits?: {
    cast: {
      id: number;
      name: string;
      character: string | null;
      profile_path: string | null;
      order: number;
    }[];
    crew: {
      id: number;
      name: string;
      job: string;
      department: string | null;
      profile_path: string | null;
    }[];
  };
  keywords?: { keywords: { id: number; name: string }[] };
  videos?: {
    results: {
      key: string;
      name: string;
      site: string;
      type: string;
      official: boolean;
      published_at: string;
    }[];
  };
  release_dates?: {
    results: {
      iso_3166_1: string;
      release_dates: { certification: string }[];
    }[];
  };
}

function apiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new ApiError(503, "TMDB integration is not configured (set TMDB_API_KEY)");
  }
  return key;
}

async function tmdbFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new ApiError(502, `TMDB request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function searchMovies(query: string): Promise<TmdbMovieSummary[]> {
  const data = await tmdbFetch<{ results: TmdbMovieSummary[] }>("/search/movie", {
    query,
    include_adult: "false",
    language: "en-US",
  });
  return data.results.slice(0, 10);
}

export async function getMovieDetail(tmdbId: number): Promise<TmdbMovieDetail> {
  return tmdbFetch<TmdbMovieDetail>(`/movie/${tmdbId}`, {
    language: "en-US",
    append_to_response: "credits,keywords,videos,release_dates,external_ids,images",
    // keep English-titled and text-free artwork in the gallery
    include_image_language: "en,null",
  });
}

// ── Extractors ───────────────────────────────────────────────────

const KEY_CREW_JOBS = new Set([
  "Director",
  "Screenplay",
  "Writer",
  "Director of Photography",
  "Original Music Composer",
  "Editor",
  "Production Design",
]);

export function extractDirector(d: TmdbMovieDetail): string | undefined {
  return d.credits?.crew.find((c) => c.job === "Director")?.name;
}

export function extractKeyCrew(d: TmdbMovieDetail) {
  const seen = new Set<string>();
  return (d.credits?.crew ?? [])
    .filter((c) => KEY_CREW_JOBS.has(c.job))
    .filter((c) => {
      const k = `${c.id}:${c.job}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 12);
}

export function extractCast(d: TmdbMovieDetail) {
  return (d.credits?.cast ?? []).slice(0, 20);
}

export function extractCertification(d: TmdbMovieDetail): string | undefined {
  const us = d.release_dates?.results.find((r) => r.iso_3166_1 === "US");
  return us?.release_dates.find((rd) => rd.certification)?.certification || undefined;
}

const VIDEO_TYPES = new Set(["Trailer", "Teaser", "Clip", "Featurette"]);

// Watchable videos, best first: official trailers ahead of teasers and clips.
export function extractVideos(d: TmdbMovieDetail) {
  const rank = (type: string, official: boolean) =>
    (type === "Trailer" ? 3 : type === "Teaser" ? 2 : type === "Clip" ? 1 : 0) + (official ? 1 : 0);

  const seen = new Set<string>();
  return (d.videos?.results ?? [])
    .filter((v) => v.site === "YouTube" && VIDEO_TYPES.has(v.type))
    .filter((v) => (seen.has(v.key) ? false : (seen.add(v.key), true)))
    .sort(
      (a, b) =>
        rank(b.type, b.official) - rank(a.type, a.official) ||
        (b.published_at ?? "").localeCompare(a.published_at ?? ""),
    )
    .slice(0, 8);
}

export function extractTrailerKey(d: TmdbMovieDetail): string | undefined {
  return extractVideos(d)[0]?.key;
}

// Highest-rated artwork first; posters and stills capped so imports stay light.
export function extractImages(d: TmdbMovieDetail) {
  const pick = (list: { file_path: string; iso_639_1: string | null; vote_average: number }[] | undefined, n: number) =>
    (list ?? []).slice().sort((a, b) => b.vote_average - a.vote_average).slice(0, n);
  return {
    posters: pick(d.images?.posters, 10),
    backdrops: pick(d.images?.backdrops, 8),
  };
}

export function extractCompanies(d: TmdbMovieDetail) {
  return d.production_companies
    .slice(0, 8)
    .map((c) => ({ name: c.name, logoPath: c.logo_path }));
}

export function tmdbImageUrl(path: string | null, size: "w185" | "w342" | "w780" = "w342"): string | null {
  if (!path || !path.startsWith("/")) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
