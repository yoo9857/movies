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
  runtime: number | null;
  genres: { id: number; name: string }[];
  credits?: { crew: { job: string; name: string }[] };
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
    append_to_response: "credits",
  });
}

export function directorOf(detail: TmdbMovieDetail): string | undefined {
  return detail.credits?.crew.find((c) => c.job === "Director")?.name;
}

export function tmdbImageUrl(path: string | null, size: "w342" | "w780" = "w342"): string | null {
  if (!path || !path.startsWith("/")) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
