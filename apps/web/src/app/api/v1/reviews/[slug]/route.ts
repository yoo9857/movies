import { prisma } from "@cinepixo/db";
import { slugSchema } from "@cinepixo/shared";
import { ApiError, handle, json } from "@/lib/api";

export const GET = handle(async (_request: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) throw new ApiError(404, "Review not found");

  const review = await prisma.review.findFirst({
    where: { slug: parsed.data, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      rating: true,
      publishedAt: true,
      viewCount: true,
      author: { select: { username: true, displayName: true } },
      movie: true,
    },
  });
  if (!review) throw new ApiError(404, "Review not found");

  return json({ review });
});
