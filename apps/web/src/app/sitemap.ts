// GET /sitemap.xml
//
// One sitemap, not an index: Google's limit is 50,000 URLs per file and the
// library is nowhere near it. Splitting early would add a layer with nothing on
// the other side of it.
//
// Two things the previous version left out, both worth having:
//
//  · `lastModified` on the *index* pages. Without it a crawler has no signal that
//    /reviews changed and re-crawls it on its own schedule; with it, publishing a
//    review makes the index look stale immediately. It is derived from the newest
//    row rather than `new Date()`, which would claim freshness every single fetch
//    and so mean nothing.
//
//  · `images`. Posters and stills are a real part of this site's content, and an
//    image sitemap is the only way they get discovered as images rather than as
//    incidental markup inside a page.
import { prisma } from "@cinepixo/db";
import type { MetadataRoute } from "next";
import { absUrl, backdropUrl, posterUrl } from "@/lib/seo";

export const dynamic = "force-dynamic"; // always reflect the live DB

/** Newest timestamp in a set of rows, or undefined when there are none. */
function newest(dates: (Date | null | undefined)[]): Date | undefined {
  let latest: Date | undefined;
  for (const d of dates) {
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [reviews, movies, critics] = await Promise.all([
    prisma.review.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { updatedAt: "desc" },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
        movie: { select: { posterPath: true, backdropPath: true } },
      },
    }),
    prisma.movie.findMany({
      orderBy: { updatedAt: "desc" },
      select: { slug: true, updatedAt: true, posterPath: true, backdropPath: true },
    }),
    prisma.critic.findMany({
      orderBy: { updatedAt: "desc" },
      select: { slug: true, updatedAt: true, avatarUrl: true },
    }),
  ]);

  const newestReview = newest(reviews.map((r) => r.updatedAt));
  const newestMovie = newest(movies.map((m) => m.updatedAt));
  const newestCritic = newest(critics.map((c) => c.updatedAt));
  const anything = newest([newestReview, newestMovie, newestCritic]);

  return [
    {
      url: absUrl("/"),
      lastModified: anything,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absUrl("/reviews"),
      lastModified: newestReview,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absUrl("/movies"),
      lastModified: newestMovie,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absUrl("/critics"),
      lastModified: newestCritic,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: absUrl("/stats"),
      lastModified: newestReview,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: absUrl("/about"),
      lastModified: newestCritic,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    // Reviews are the reason the site exists, so they outrank the library.
    ...reviews.map((r) => ({
      url: absUrl(`/reviews/${r.slug}`),
      lastModified: r.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.9,
      images: [
        backdropUrl(r.movie.backdropPath, "w1280"),
        posterUrl(r.movie.posterPath, "w780"),
      ].filter((u): u is string => Boolean(u)),
    })),
    ...movies.map((m) => ({
      url: absUrl(`/movies/${m.slug}`),
      lastModified: m.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      images: [posterUrl(m.posterPath, "w780"), backdropUrl(m.backdropPath, "w1280")].filter(
        (u): u is string => Boolean(u),
      ),
    })),
    ...critics.map((c) => ({
      url: absUrl(`/critics/${c.slug}`),
      lastModified: c.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      images: c.avatarUrl ? [c.avatarUrl] : [],
    })),
  ];
}
