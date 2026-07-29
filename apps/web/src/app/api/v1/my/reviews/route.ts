import { prisma } from "@cinepixo/db";
import { reviewInputSchema } from "@cinepixo/shared";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Member: list own reviews (any status).
export const GET = handle(async () => {
  const user = await requireUser();
  const reviews = await prisma.review.findMany({
    where: { authorId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      rating: true,
      status: true,
      viewCount: true,
      updatedAt: true,
      movie: { select: { title: true } },
    },
  });
  return json({ reviews });
});

// Member: publish a review of their own.
export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  const user = await requireUser();
  rateLimit(`review-create:${clientIp(request)}`, 10, 60 * 60_000); // spam guard

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
      verdict: input.verdict,
      content: input.content,
      rating: input.rating,
      status: input.status,
      spoilers: input.spoilers,
      publishedAt: input.status === "PUBLISHED" ? new Date() : null,
      authorId: user.id,
      movieId: input.movieId,
    },
  });

  return json({ review }, { status: 201 });
});
