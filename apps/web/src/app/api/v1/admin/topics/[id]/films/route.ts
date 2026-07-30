import { prisma } from "@cinepixo/db";
import { topicFilmsSchema } from "@cinepixo/shared";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

const idSchema = z.string().min(1).max(64);

/**
 * Replace a topic's film list. Wholesale on purpose: assigning films to an
 * editorial axis is curation — the admin screen shows the whole list and
 * saves the whole list, so there is no partial state to merge.
 */
export const PUT = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { id } = await ctx.params;
  const topicId = idSchema.parse(id);
  const { films } = topicFilmsSchema.parse(await parseJson(request));

  const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { id: true } });
  if (!topic) throw new ApiError(404, "Topic not found");

  const movieIds = [...new Set(films.map((f) => f.movieId))];
  const found = await prisma.movie.findMany({
    where: { id: { in: movieIds } },
    select: { id: true },
  });
  if (found.length !== movieIds.length) {
    throw new ApiError(400, "One of those films does not exist");
  }

  await prisma.$transaction([
    prisma.movieTopic.deleteMany({ where: { topicId } }),
    prisma.movieTopic.createMany({
      data: films.map((f) => ({ topicId, movieId: f.movieId, note: f.note ?? null })),
    }),
    // The topic's public page just changed; its sitemap lastmod should say so.
    prisma.topic.update({ where: { id: topicId }, data: { updatedAt: new Date() } }),
  ]);

  return json({ ok: true, count: films.length });
});
