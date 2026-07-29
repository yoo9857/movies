import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  extractCast,
  extractCertification,
  extractCompanies,
  extractDirector,
  extractImages,
  extractKeyCrew,
  extractTrailerKey,
  extractVideos,
  getMovieDetail,
} from "@/lib/tmdb";

// TMDB gives bare handles; store nothing that isn't a plain handle/slug.
function socialHandle(v: string | null | undefined): string | null {
  return v && /^[A-Za-z0-9._-]{1,60}$/.test(v) ? v : null;
}
function httpUrl(v: string | null | undefined): string | null {
  return v && /^https?:\/\//.test(v) ? v.slice(0, 500) : null;
}

const importSchema = z.object({ tmdbId: z.number().int().positive() });

// Admin: import (or refresh) a movie from TMDB with full credits/keywords/videos.
export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  await requireAdmin();
  rateLimit(`tmdb-import:${clientIp(request)}`, 20, 60_000);

  const { tmdbId } = importSchema.parse(await parseJson(request));
  const d = await getMovieDetail(tmdbId);

  const data = {
    imdbId: d.imdb_id ?? null,
    title: d.title,
    originalTitle: d.original_title,
    tagline: d.tagline || null,
    overview: d.overview || null,
    posterPath: d.poster_path,
    backdropPath: d.backdrop_path,
    releaseDate: d.release_date ? new Date(d.release_date) : null,
    runtime: d.runtime,
    director: extractDirector(d) ?? null,
    genres: JSON.stringify(d.genres.map((g) => g.name)),
    keywords: JSON.stringify((d.keywords?.keywords ?? []).slice(0, 15).map((k) => k.name)),
    countries: JSON.stringify(d.production_countries.map((c) => c.name)),
    certification: extractCertification(d) ?? null,
    budget: d.budget > 0 ? d.budget : null,
    revenue: d.revenue > 0 ? d.revenue : null,
    voteAverage: d.vote_average > 0 ? d.vote_average : null,
    voteCount: d.vote_count > 0 ? d.vote_count : null,
    popularity: d.popularity > 0 ? d.popularity : null,
    trailerKey: extractTrailerKey(d) ?? null,
    collectionId: d.belongs_to_collection?.id ?? null,
    collectionName: d.belongs_to_collection?.name ?? null,
    companies: JSON.stringify(extractCompanies(d)),
    homepage: httpUrl(d.homepage),
    instagram: socialHandle(d.external_ids?.instagram_id),
    facebook: socialHandle(d.external_ids?.facebook_id),
    twitter: socialHandle(d.external_ids?.twitter_id),
  };

  const cast = extractCast(d);
  const crew = extractKeyCrew(d);
  const videos = extractVideos(d);
  const { posters, backdrops } = extractImages(d);

  // Idempotent refresh: replace cast/crew atomically with the movie upsert.
  const movie = await prisma.$transaction(async (tx) => {
    const m = await tx.movie.upsert({
      where: { tmdbId },
      update: data,
      create: { tmdbId, ...data },
    });
    await tx.movieCast.deleteMany({ where: { movieId: m.id } });
    await tx.movieCrew.deleteMany({ where: { movieId: m.id } });
    await tx.movieVideo.deleteMany({ where: { movieId: m.id } });
    await tx.movieImage.deleteMany({ where: { movieId: m.id } });
    if (videos.length > 0) {
      await tx.movieVideo.createMany({
        data: videos.map((v, i) => ({
          movieId: m.id,
          youtubeKey: v.key,
          name: v.name ?? v.type,
          type: v.type,
          official: v.official,
          publishedAt: v.published_at ? new Date(v.published_at) : null,
          sort: i,
        })),
      });
    }
    const artwork = [
      ...posters.map((p, i) => ({ kind: "poster", path: p.file_path, lang: p.iso_639_1, sort: i })),
      ...backdrops.map((b, i) => ({ kind: "backdrop", path: b.file_path, lang: b.iso_639_1, sort: i })),
    ];
    if (artwork.length > 0) {
      await tx.movieImage.createMany({
        data: artwork.map((a) => ({ movieId: m.id, ...a })),
      });
    }
    if (cast.length > 0) {
      await tx.movieCast.createMany({
        data: cast.map((c) => ({
          movieId: m.id,
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
          movieId: m.id,
          tmdbPersonId: c.id,
          name: c.name,
          job: c.job,
          department: c.department,
          profilePath: c.profile_path,
        })),
      });
    }
    return m;
  });

  return json({ movie }, { status: 201 });
});
