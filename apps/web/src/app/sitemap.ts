import { prisma } from "@cinepixo/db";
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic"; // always reflect the live DB

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [reviews, movies, critics] = await Promise.all([
    prisma.review.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
    }),
    prisma.movie.findMany({ select: { id: true, updatedAt: true } }),
    prisma.critic.findMany({ select: { slug: true, updatedAt: true } }),
  ]);

  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/reviews`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/movies`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/critics`, changeFrequency: "weekly", priority: 0.7 },
    ...reviews.map((r) => ({
      url: `${SITE_URL}/reviews/${r.slug}`,
      lastModified: r.updatedAt,
      priority: 0.8,
    })),
    ...movies.map((m) => ({
      url: `${SITE_URL}/movies/${m.id}`,
      lastModified: m.updatedAt,
      priority: 0.6,
    })),
    ...critics.map((c) => ({
      url: `${SITE_URL}/critics/${c.slug}`,
      lastModified: c.updatedAt,
      priority: 0.6,
    })),
  ];
}
