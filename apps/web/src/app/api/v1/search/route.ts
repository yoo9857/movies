import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const querySchema = z.string().trim().min(1).max(100);

export const GET = handle(async (request: Request) => {
  rateLimit(`search:${clientIp(request)}`, 30, 60_000);

  const url = new URL(request.url);
  const q = querySchema.parse(url.searchParams.get("q") ?? "");

  const [reviews, movies, critics] = await Promise.all([
    prisma.review.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ title: { contains: q } }, { excerpt: { contains: q } }],
      },
      orderBy: { publishedAt: "desc" },
      take: 10,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        rating: true,
        movie: { select: { title: true } },
      },
    }),
    prisma.movie.findMany({
      where: {
        OR: [{ title: { contains: q } }, { originalTitle: { contains: q } }, { director: { contains: q } }],
      },
      take: 10,
      select: { id: true, title: true, posterPath: true, releaseDate: true, director: true },
    }),
    prisma.critic.findMany({
      where: { name: { contains: q } },
      take: 10,
      select: { slug: true, name: true, bio: true },
    }),
  ]);

  return json({ reviews, movies, critics });
});
