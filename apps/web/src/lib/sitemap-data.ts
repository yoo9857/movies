/**
 * The sitemap tree: one index, one file per kind of thing.
 *
 * This replaces a single flat sitemap.ts for two reasons, neither of which is
 * URL count (the 50k limit is nowhere in sight):
 *
 *  · **the index is legible.** /sitemap.xml now says what the site *contains* —
 *    pages, reviews, movies, people, critics — and each section's lastmod says
 *    which shelf moved. A crawler that only wants new reviews fetches one small
 *    file instead of everything.
 *  · **humans open these files.** Every file carries an xml-stylesheet
 *    instruction, so a browser shows the index as a folder listing and each
 *    section as a table, in the house style. The XML underneath is unchanged
 *    and strictly standard; crawlers never see the difference.
 *
 * Everything is emitted by hand rather than through MetadataRoute because the
 * stylesheet instruction is exactly the part the framework's sitemap
 * convention cannot express.
 */
import { prisma } from "@cinepixo/db";
import { absUrl, backdropUrl, posterUrl } from "@/lib/seo";

export interface SitemapUrl {
  url: string;
  lastModified?: Date;
  changeFrequency?: "daily" | "weekly" | "monthly";
  priority?: number;
  images?: string[];
}

export const SECTIONS = ["pages", "reviews", "movies", "people", "critics"] as const;
export type Section = (typeof SECTIONS)[number];

/** Newest timestamp in a set of rows, or undefined when there are none. */
function newest(dates: (Date | null | undefined)[]): Date | undefined {
  let latest: Date | undefined;
  for (const d of dates) {
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

/** One section's URLs, plus the newest change inside it (for the index). */
export async function sectionUrls(section: Section): Promise<SitemapUrl[]> {
  switch (section) {
    case "reviews": {
      const reviews = await prisma.review.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { updatedAt: "desc" },
        select: {
          slug: true,
          updatedAt: true,
          movie: { select: { posterPath: true, backdropPath: true } },
        },
      });
      // Reviews are the reason the site exists, so they outrank the library.
      return reviews.map((r) => ({
        url: absUrl(`/reviews/${r.slug}`),
        lastModified: r.updatedAt,
        changeFrequency: "monthly",
        priority: 0.9,
        images: [
          backdropUrl(r.movie.backdropPath, "w1280"),
          posterUrl(r.movie.posterPath, "w780"),
        ].filter((u): u is string => Boolean(u)),
      }));
    }
    case "movies": {
      const movies = await prisma.movie.findMany({
        orderBy: { updatedAt: "desc" },
        select: { slug: true, updatedAt: true, posterPath: true, backdropPath: true },
      });
      return movies.map((m) => ({
        url: absUrl(`/movies/${m.slug}`),
        lastModified: m.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
        images: [posterUrl(m.posterPath, "w780"), backdropUrl(m.backdropPath, "w1280")].filter(
          (u): u is string => Boolean(u),
        ),
      }));
    }
    case "people": {
      // Only people actually credited on something: a person page with an
      // empty filmography has nothing to index.
      const people = await prisma.person.findMany({
        where: { OR: [{ castRoles: { some: {} } }, { crewRoles: { some: {} } }] },
        orderBy: { updatedAt: "desc" },
        select: { slug: true, updatedAt: true, image: true },
      });
      return people.map((p) => ({
        url: absUrl(`/people/${p.slug}`),
        lastModified: p.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
        // Only our own object — a TMDB path is not ours to advertise as media.
        images: p.image ? [absUrl(p.image)] : [],
      }));
    }
    case "critics": {
      const critics = await prisma.critic.findMany({
        orderBy: { updatedAt: "desc" },
        select: { slug: true, updatedAt: true, avatarUrl: true },
      });
      return critics.map((c) => ({
        url: absUrl(`/critics/${c.slug}`),
        lastModified: c.updatedAt,
        changeFrequency: "monthly",
        priority: 0.6,
        images: c.avatarUrl ? [c.avatarUrl] : [],
      }));
    }
    case "pages": {
      // The handful of listing pages. Their lastmod is derived from the newest
      // row they list, not `new Date()` — claiming freshness on every fetch
      // means nothing.
      const [review, movie, critic, person] = await Promise.all([
        prisma.review.findFirst({
          where: { status: "PUBLISHED" },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
        prisma.movie.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        prisma.critic.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        prisma.person.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
      ]);
      const anything = newest([
        review?.updatedAt,
        movie?.updatedAt,
        critic?.updatedAt,
        person?.updatedAt,
      ]);
      return [
        { url: absUrl("/"), lastModified: anything, changeFrequency: "daily", priority: 1 },
        { url: absUrl("/reviews"), lastModified: review?.updatedAt, changeFrequency: "daily", priority: 0.9 },
        { url: absUrl("/movies"), lastModified: movie?.updatedAt, changeFrequency: "weekly", priority: 0.8 },
        { url: absUrl("/people"), lastModified: person?.updatedAt, changeFrequency: "weekly", priority: 0.6 },
        { url: absUrl("/critics"), lastModified: critic?.updatedAt, changeFrequency: "weekly", priority: 0.7 },
        { url: absUrl("/stats"), lastModified: review?.updatedAt, changeFrequency: "weekly", priority: 0.5 },
        { url: absUrl("/about"), lastModified: critic?.updatedAt, changeFrequency: "monthly", priority: 0.6 },
      ];
    }
  }
}

/** Section lastmods for the index — one cheap query per shelf. */
export async function sectionLastmods(): Promise<Record<Section, Date | undefined>> {
  const [review, movie, critic, person] = await Promise.all([
    prisma.review.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.movie.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.critic.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.person.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const anything = newest([
    review?.updatedAt,
    movie?.updatedAt,
    critic?.updatedAt,
    person?.updatedAt,
  ]);
  return {
    pages: anything,
    reviews: review?.updatedAt,
    movies: movie?.updatedAt,
    people: person?.updatedAt,
    critics: critic?.updatedAt,
  };
}

/* ── XML emission ────────────────────────────────────────────── */

const xmlEscape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const STYLE_PI = `<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>`;

export function urlsetXml(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => {
      const parts = [
        `  <url>`,
        `    <loc>${xmlEscape(u.url)}</loc>`,
        u.lastModified ? `    <lastmod>${u.lastModified.toISOString()}</lastmod>` : null,
        u.changeFrequency ? `    <changefreq>${u.changeFrequency}</changefreq>` : null,
        u.priority != null ? `    <priority>${u.priority}</priority>` : null,
        ...(u.images ?? []).map(
          (img) => `    <image:image><image:loc>${xmlEscape(img)}</image:loc></image:image>`,
        ),
        `  </url>`,
      ];
      return parts.filter((p) => p !== null).join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
${STYLE_PI}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>`;
}

export function indexXml(lastmods: Record<Section, Date | undefined>): string {
  const body = SECTIONS.map((s) => {
    const lastmod = lastmods[s];
    return [
      `  <sitemap>`,
      `    <loc>${xmlEscape(absUrl(`/sitemaps/${s}.xml`))}</loc>`,
      lastmod ? `    <lastmod>${lastmod.toISOString()}</lastmod>` : null,
      `  </sitemap>`,
    ]
      .filter((p) => p !== null)
      .join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
${STYLE_PI}
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>`;
}

export function sitemapResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=86400",
    },
  });
}
