import { prisma } from "@cinepixo/db";
import { slugSchema } from "@cinepixo/shared";
import { ApiError, handle, json, requireSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";

// The counter on Review is denormalised for cheap sorting, so it is only ever
// written inside the same transaction as the vote row.
async function setVote(slug: string, userId: string, on: boolean) {
  return prisma.$transaction(async (tx) => {
    const review = await tx.review.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: { id: true, authorId: true },
    });
    if (!review) throw new ApiError(404, "Review not found");
    if (review.authorId === userId) {
      throw new ApiError(403, "You can't mark your own review helpful");
    }

    const existing = await tx.reviewVote.findUnique({
      where: { reviewId_userId: { reviewId: review.id, userId } },
    });

    if (on && !existing) {
      await tx.reviewVote.create({ data: { reviewId: review.id, userId } });
    } else if (!on && existing) {
      await tx.reviewVote.delete({ where: { id: existing.id } });
    }

    // recount rather than increment: idempotent under retries and races
    const helpfulCount = await tx.reviewVote.count({ where: { reviewId: review.id } });
    await tx.review.update({ where: { id: review.id }, data: { helpfulCount } });
    return { helpfulCount, voted: on };
  });
}

export const POST = handle(async (request: Request, ctx: { params: Promise<{ slug: string }> }) => {
  requireSameOrigin(request);
  const user = await requireUser();
  const { slug } = await ctx.params;
  return json(await setVote(slugSchema.parse(slug), user.id, true));
});

export const DELETE = handle(
  async (request: Request, ctx: { params: Promise<{ slug: string }> }) => {
    requireSameOrigin(request);
    const user = await requireUser();
    const { slug } = await ctx.params;
    return json(await setVote(slugSchema.parse(slug), user.id, false));
  },
);
