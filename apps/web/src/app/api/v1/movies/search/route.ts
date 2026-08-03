import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { posterUrl } from "@/lib/seo";

/**
 * Find a film to write about.
 *
 * This exists because the review editor used to be handed the library — every
 * page that renders it ran `movie.findMany` with no `take`, which was 118,811
 * rows with a stills subquery each, serialised into the RSC payload and then
 * filtered in the browser. That was fine at twenty-one films. Afterwards it was
 * a page any logged-in member could open to take the site down, and on
 * 2026-08-03 the equivalent query on the portrait desk did exactly that.
 *
 * So the filtering moved to where the index is. `requireUser`, not
 * `requireAdmin`: /write and /me/reviews/[id]/edit are member surfaces, and a
 * member who can write a review can look up a film to write it about. It reads
 * nothing that is not already public on /movies — the rate limit is here to stop
 * it being used as a bulk export of the library, not to protect a secret.
 */

/** Same ceiling the picker's dropdown could ever show. */
const LIMIT = 40;

export const GET = handle(async (request: Request) => {
  await requireUser();
  rateLimit(`movie-search:${clientIp(request)}`, 120, 60_000);

  const q = z
    .string()
    .trim()
    .max(100)
    .parse(new URL(request.url).searchParams.get("q") ?? "");

  // An empty query is the dropdown's resting state: the newest films, which on a
  // library fed by import is where anything worth reviewing has just arrived.
  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { originalTitle: { contains: q, mode: "insensitive" as const } },
          { director: { contains: q, mode: "insensitive" as const } },
          // A bare year is a real way to search when two films share a title.
          ...(/^\d{4}$/.test(q)
            ? [
                {
                  releaseDate: {
                    gte: new Date(`${q}-01-01T00:00:00Z`),
                    lt: new Date(`${Number(q) + 1}-01-01T00:00:00Z`),
                  },
                },
              ]
            : []),
        ],
      }
    : {};

  const movies = await prisma.movie.findMany({
    where,
    // Sitelink count is Wikidata's own measure of how much the world has written
    // about a film, and it is indexed. Searching "batman" should offer the ones
    // people mean before a straight-to-video sequel that shares the word.
    orderBy: q
      ? [{ wikidataSitelinks: { sort: "desc", nulls: "last" } }, { title: "asc" }]
      : [{ createdAt: "desc" }],
    take: LIMIT,
    select: {
      id: true,
      title: true,
      releaseDate: true,
      director: true,
      trailerKey: true,
      image: true,
      posterPath: true,
      images: {
        where: { kind: "backdrop" },
        orderBy: { sort: "asc" },
        select: { path: true },
        // The editor preview shows a handful; there is no reason to carry more.
        take: 6,
      },
    },
  });

  return json({
    movies: movies.map((m) => ({
      id: m.id,
      title: m.title,
      year: m.releaseDate ? new Date(m.releaseDate).getUTCFullYear() : null,
      director: m.director,
      trailerKey: m.trailerKey,
      stills: m.images.map((i) => i.path),
      // Our own artwork first. The topic picker shows a thumbnail to tell two
      // films with one title apart, and `posterPath` is set on nine rows in the
      // whole library, so without `image` it was showing nothing.
      poster: m.image ?? posterUrl(m.posterPath, "w92") ?? null,
    })),
  });
});
