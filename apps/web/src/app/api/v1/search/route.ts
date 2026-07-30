import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const querySchema = z.string().trim().min(1).max(100);

// Case-insensitive on purpose, and a PostgreSQL-migration regression when it
// wasn't: SQLite's LIKE ignores case, Postgres's does not, so "parasite"
// suddenly stopped finding "Parasite". `mode: "insensitive"` maps to ILIKE,
// which is exactly what the trigram indexes in the constraints migration were
// built to serve.
const ci = (value: string) => ({ contains: value, mode: "insensitive" as const });

export const GET = handle(async (request: Request) => {
  rateLimit(`search:${clientIp(request)}`, 30, 60_000);

  const url = new URL(request.url);
  const q = querySchema.parse(url.searchParams.get("q") ?? "");

  const [reviews, movies, critics] = await Promise.all([
    prisma.review.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ title: ci(q) }, { excerpt: ci(q) }],
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
        OR: [{ title: ci(q) }, { originalTitle: ci(q) }, { director: ci(q) }],
      },
      take: 10,
      select: { id: true, slug: true, title: true, posterPath: true, releaseDate: true, director: true },
    }),
    prisma.critic.findMany({
      where: { name: ci(q) },
      take: 10,
      select: { slug: true, name: true, bio: true },
    }),
  ]);

  return json({ reviews, movies, critics });
});
