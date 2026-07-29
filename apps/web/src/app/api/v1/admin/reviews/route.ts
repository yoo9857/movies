import { prisma } from "@cinepixo/db";
import { reviewInputSchema } from "@cinepixo/shared";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

// Admin: list all reviews including drafts.
export const GET = handle(async () => {
  await requireAdmin();
  const reviews = await prisma.review.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      rating: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      movie: { select: { title: true } },
      author: { select: { username: true } },
    },
  });
  return json({ reviews });
});

// Admin: create a review authored by the signed-in admin.
export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  const admin = await requireAdmin();
  const input = reviewInputSchema.parse(await parseJson(request));

  const movie = await prisma.movie.findUnique({ where: { id: input.movieId } });
  if (!movie) throw new ApiError(400, "Unknown movieId");

  const existing = await prisma.review.findUnique({ where: { slug: input.slug } });
  if (existing) throw new ApiError(409, "A review with this slug already exists");

  const review = await prisma.review.create({
    data: {
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      rating: input.rating,
      status: input.status,
      publishedAt: input.status === "PUBLISHED" ? new Date() : null,
      authorId: admin.id,
      movieId: input.movieId,
    },
  });

  return json({ review }, { status: 201 });
});
