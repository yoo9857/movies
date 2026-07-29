import { prisma } from "@cinepixo/db";
import { reviewInputSchema } from "@cinepixo/shared";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

const idSchema = z.string().min(1).max(64);

export const GET = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const review = await prisma.review.findUnique({
    where: { id: idSchema.parse(id) },
    include: { movie: { select: { id: true, title: true } } },
  });
  if (!review) throw new ApiError(404, "Review not found");
  return json({ review });
});

export const PUT = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();
  const { id } = await ctx.params;
  const reviewId = idSchema.parse(id);

  const input = reviewInputSchema.parse(await parseJson(request));

  const current = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!current) throw new ApiError(404, "Review not found");

  const slugTaken = await prisma.review.findFirst({
    where: { slug: input.slug, NOT: { id: reviewId } },
  });
  if (slugTaken) throw new ApiError(409, "A review with this slug already exists");

  const review = await prisma.review.update({
    where: { id: reviewId },
    data: {
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt ?? null,
      content: input.content,
      rating: input.rating,
      status: input.status,
      // keep the original publish date on re-saves; stamp on first publish
      publishedAt:
        input.status === "PUBLISHED" ? (current.publishedAt ?? new Date()) : null,
      movieId: input.movieId,
    },
  });

  return json({ review });
});

export const DELETE = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();
  const { id } = await ctx.params;
  const reviewId = idSchema.parse(id);

  const existing = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!existing) throw new ApiError(404, "Review not found");

  await prisma.review.delete({ where: { id: reviewId } });
  return json({ ok: true });
});
