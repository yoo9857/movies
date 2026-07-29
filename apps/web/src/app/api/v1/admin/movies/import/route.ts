import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { directorOf, getMovieDetail } from "@/lib/tmdb";

const importSchema = z.object({ tmdbId: z.number().int().positive() });

// Admin: import a movie from TMDB (idempotent — re-import updates fields).
export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  await requireAdmin();
  rateLimit(`tmdb-import:${clientIp(request)}`, 20, 60_000);

  const { tmdbId } = importSchema.parse(await parseJson(request));
  const detail = await getMovieDetail(tmdbId);

  const data = {
    title: detail.title,
    originalTitle: detail.original_title,
    overview: detail.overview || null,
    posterPath: detail.poster_path,
    backdropPath: detail.backdrop_path,
    releaseDate: detail.release_date ? new Date(detail.release_date) : null,
    runtime: detail.runtime,
    director: directorOf(detail) ?? null,
    genres: JSON.stringify(detail.genres.map((g) => g.name)),
  };

  const movie = await prisma.movie.upsert({
    where: { tmdbId },
    update: data,
    create: { tmdbId, ...data },
  });

  return json({ movie }, { status: 201 });
});
