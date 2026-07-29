import { prisma } from "@cinepixo/db";
import { paginationSchema } from "@cinepixo/shared";
import { handle, json } from "@/lib/api";

// Public: published reviews, newest first.
export const GET = handle(async (request: Request) => {
  const url = new URL(request.url);
  const { page, pageSize } = paginationSchema.parse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });

  const where = { status: "PUBLISHED" } as const;
  const [total, reviews] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        rating: true,
        publishedAt: true,
        author: { select: { username: true, displayName: true } },
        movie: {
          select: { id: true, title: true, posterPath: true, releaseDate: true, director: true },
        },
      },
    }),
  ]);

  return json({ reviews, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
});
