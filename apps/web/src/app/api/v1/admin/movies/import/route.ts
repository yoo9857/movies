import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  extractCast,
  extractCertification,
  extractDirector,
  extractKeyCrew,
  extractTrailerKey,
  getMovieDetail,
} from "@/lib/tmdb";

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
  };

  const cast = extractCast(d);
  const crew = extractKeyCrew(d);

  // Idempotent refresh: replace cast/crew atomically with the movie upsert.
  const movie = await prisma.$transaction(async (tx) => {
    const m = await tx.movie.upsert({
      where: { tmdbId },
      update: data,
      create: { tmdbId, ...data },
    });
    await tx.movieCast.deleteMany({ where: { movieId: m.id } });
    await tx.movieCrew.deleteMany({ where: { movieId: m.id } });
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
