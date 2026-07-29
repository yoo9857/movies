import { prisma } from "@cinepixo/db";
import { reviewInputSchema } from "@cinepixo/shared";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";

const idSchema = z.string().min(1).max(64);

// Ownership check: members can only touch their own reviews.
async function ownedReview(reviewId: string, userId: string) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review || review.authorId !== userId) {
    // same 404 whether it doesn't exist or belongs to someone else — no probing
    throw new ApiError(404, "Review not found");
  }
  return review;
}

export const GET = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const review = await ownedReview(idSchema.parse(id), user.id);
  return json({ review });
});

export const PUT = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  const user = await requireUser();
  const { id } = await ctx.params;
  const current = await ownedReview(idSchema.parse(id), user.id);

  const input = reviewInputSchema.parse(await parseJson(request));

  const slugTaken = await prisma.review.findFirst({
    where: { slug: input.slug, NOT: { id: current.id } },
  });
  if (slugTaken) throw new ApiError(409, "A review with this slug already exists");

  const review = await prisma.review.update({
    where: { id: current.id },
    data: {
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt ?? null,
      verdict: input.verdict ?? null,
      content: input.content,
      rating: input.rating,
      status: input.status,
      spoilers: input.spoilers,
      publishedAt: input.status === "PUBLISHED" ? (current.publishedAt ?? new Date()) : null,
      movieId: input.movieId,
    },
  });

  return json({ review });
});

export const DELETE = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  const user = await requireUser();
  const { id } = await ctx.params;
  const current = await ownedReview(idSchema.parse(id), user.id);

  await prisma.review.delete({ where: { id: current.id } });
  return json({ ok: true });
});
