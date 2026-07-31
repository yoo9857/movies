import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { ApiError, handle, json, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { enrichMovie } from "@/lib/enrich-movie";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * The desk's find-and-register button: one film, filled from the open sources
 * on demand — facts and runtime from Wikidata, synopsis and poster from the
 * film's own article. Fill-only, like the lanes it borrows its logic from, so
 * it is safe to press twice and safe to press after a hand upload.
 */

const idSchema = z.string().min(1).max(64);

export const POST = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  const admin = await requireAdmin();
  rateLimit(`movie-enrich:${admin.id}`, 30, 60 * 60_000);
  rateLimit(`movie-enrich-ip:${clientIp(request)}`, 60, 60 * 60_000);

  const { id } = await ctx.params;
  const movieId = idSchema.parse(id);
  const exists = await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } });
  if (!exists) throw new ApiError(404, "Movie not found");

  const report = await enrichMovie(movieId);
  return json(report);
});
