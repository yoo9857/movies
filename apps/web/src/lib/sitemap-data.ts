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

export const SECTIONS = ["pages", "reviews", "movies", "people", "topics", "critics"] as const;
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
        // Only films carrying something of ours — a published review, or a place
        // on an editorial axis. The library itself is six figures deep and grows
        // from Wikidata, so submitting every row would mean offering a crawler
        // tens of thousands of pages that restate a database. The page metadata
        // marks those `noindex, follow` for the same reason; a film joins this
        // file the moment someone writes about it.
        where: {
          OR: [{ reviews: { some: { status: "PUBLISHED" } } }, { topics: { some: {} } }],
        },
        orderBy: { updatedAt: "desc" },
        select: {
          slug: true,
          updatedAt: true,
          posterPath: true,
          backdropPath: true,
          image: true,
          // A film page renders the axes it carries and the sentence written for
          // each, so an assignment — or an edit to an axis it sits on — changes
          // the page while the Movie row is untouched. Reporting only
          // Movie.updatedAt told crawlers nothing had changed on the day every
          // film page gained a section.
          topics: { select: { createdAt: true, topic: { select: { updatedAt: true } } } },
        },
      });
      return movies.map((m) => ({
        url: absUrl(`/movies/${m.slug}`),
        lastModified: newest([
          m.updatedAt,
          ...m.topics.flatMap((t) => [t.createdAt, t.topic.updatedAt]),
        ]),
        changeFrequency: "weekly",
        priority: 0.7,
        // Our own file first — an image on our origin is one Google can attribute
        // to this page rather than to every site using the same CDN path.
        images: [
          m.image ? absUrl(m.image) : undefined,
          posterUrl(m.posterPath, "w780"),
          backdropUrl(m.backdropPath, "w1280"),
        ].filter((u): u is string => Boolean(u)),
      }));
    }
    case "people": {
      // Credited *and* carrying something a visitor came for: our prose, a
      // portrait we own, or a film of theirs that has been reviewed here.
      //
      // "Credited on anything" was the bar while the library was hand-built. The
      // bulk import made it useless — hundreds of thousands of people, each with
      // a name and a filmography restating a database, would be a sitemap past
      // the 50,000-URL limit and an index full of pages nobody wrote. The page
      // metadata marks the rest `noindex, follow`, exactly as it does for films.
      const people = await prisma.person.findMany({
        where: {
          OR: [
            { bio: { not: null } },
            { notes: { not: null } },
            { image: { not: null } },
            { castRoles: { some: { movie: { reviews: { some: { status: "PUBLISHED" } } } } } },
            { crewRoles: { some: { movie: { reviews: { some: { status: "PUBLISHED" } } } } } },
          ],
        },
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
    case "topics": {
      // Same rule as people: a topic page with no films yet is thin — it joins
      // the sitemap once the curation exists.
      const topics = await prisma.topic.findMany({
        where: { movies: { some: {} } },
        orderBy: { updatedAt: "desc" },
        select: {
          slug: true,
          updatedAt: true,
          movies: {
            orderBy: { sort: "asc" },
            take: 3,
            select: { movie: { select: { posterPath: true } } },
          },
        },
      });
      return topics.map((t) => ({
        url: absUrl(`/topics/${t.slug}`),
        lastModified: t.updatedAt,
        changeFrequency: "monthly",
        priority: 0.6,
        // w185 is the size the page actually renders these at; advertising a
        // larger file would list an image that appears nowhere.
        images: t.movies
          .map((m) => posterUrl(m.movie.posterPath, "w185"))
          .filter((u): u is string => Boolean(u)),
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
      const [review, movie, critic, person, topic, genreRows, decadeRows] = await Promise.all([
        prisma.review.findFirst({
          where: { status: "PUBLISHED" },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
        prisma.movie.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        prisma.critic.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        prisma.person.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        prisma.topic.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        // The browse states, aggregated in the database.
        //
        // This used to read one column of every film and group them in JS, which
        // was fine at nine films and is not at six figures — this file is
        // force-dynamic, so that was a full-table read per request. A genre needs
        // a floor of films behind it to be worth submitting: a filter page
        // listing two titles is a thin page with a canonical URL.
        prisma.$queryRaw<{ genre: string; films: bigint; last: Date | null }[]>`
          SELECT g AS genre, COUNT(*) AS films, MAX("updatedAt") AS last
          FROM "Movie", LATERAL unnest("genres") AS g
          GROUP BY g
          HAVING COUNT(*) >= 8
          ORDER BY g
        `,
        prisma.$queryRaw<{ decade: number; films: bigint; last: Date | null }[]>`
          SELECT (date_part('decade', "releaseDate") * 10)::int AS decade,
                 COUNT(*) AS films, MAX("updatedAt") AS last
          FROM "Movie"
          WHERE "releaseDate" IS NOT NULL
          GROUP BY 1
          HAVING COUNT(*) >= 8
          ORDER BY 1 DESC
        `,
      ]);
      const anything = newest([
        review?.updatedAt,
        movie?.updatedAt,
        critic?.updatedAt,
        person?.updatedAt,
        topic?.updatedAt,
      ]);

      // Genre and decade change *which* films are listed, so /movies gives each
      // its own canonical URL and marks it indexable — and until now nothing
      // announced them. These are the long-tail entry points ("korean thriller
      // films", "films from the 1990s"), and a crawler could only reach them by
      // guessing at query strings.
      //
      // Sort order and grid-vs-index canonicalise away on that page, so they are
      // deliberately absent here: listing them would submit URLs that declare a
      // different address as their canonical.
      const browseUrl = (params: Record<string, string>) =>
        absUrl(`/movies?${new URLSearchParams(params).toString()}`);

      const browseStates: SitemapUrl[] = [
        ...genreRows.map((g) => ({
          url: browseUrl({ genre: g.genre }),
          lastModified: g.last ?? undefined,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        })),
        ...decadeRows.map((d) => ({
          url: browseUrl({ decade: String(d.decade) }),
          lastModified: d.last ?? undefined,
          changeFrequency: "weekly" as const,
          priority: 0.5,
        })),
      ];

      return [
        // `https://host/` here against `https://host` in the rendered canonical:
        // the same resource by RFC 3986 (an empty path is "/"), and both are
        // normalised to one URL before anything indexes them. Left as the root
        // spelling a sitemap conventionally carries.
        { url: absUrl("/"), lastModified: anything, changeFrequency: "daily", priority: 1 },
        { url: absUrl("/reviews"), lastModified: review?.updatedAt, changeFrequency: "daily", priority: 0.9 },
        { url: absUrl("/movies"), lastModified: movie?.updatedAt, changeFrequency: "weekly", priority: 0.8 },
        { url: absUrl("/people"), lastModified: person?.updatedAt, changeFrequency: "weekly", priority: 0.6 },
        { url: absUrl("/topics"), lastModified: topic?.updatedAt, changeFrequency: "weekly", priority: 0.7 },
        { url: absUrl("/critics"), lastModified: critic?.updatedAt, changeFrequency: "weekly", priority: 0.7 },
        { url: absUrl("/stats"), lastModified: review?.updatedAt, changeFrequency: "weekly", priority: 0.5 },
        { url: absUrl("/about"), lastModified: critic?.updatedAt, changeFrequency: "monthly", priority: 0.6 },
        ...browseStates,
      ];
    }
  }
}

/** Section lastmods for the index — one cheap query per shelf. */
export async function sectionLastmods(): Promise<Record<Section, Date | undefined>> {
  const [review, movie, critic, person, topic, assignment] = await Promise.all([
    prisma.review.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.movie.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.critic.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.person.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    // Only axes with films, so this matches what the topics section contains.
    prisma.topic.findFirst({
      where: { movies: { some: {} } },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.movieTopic.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  // The film shelf moves when an assignment lands, not only when a Movie row is
  // written — same reason the per-URL lastmod above folds these in.
  const films = newest([movie?.updatedAt, assignment?.createdAt, topic?.updatedAt]);
  const anything = newest([
    review?.updatedAt,
    films,
    critic?.updatedAt,
    person?.updatedAt,
    topic?.updatedAt,
  ]);
  return {
    pages: anything,
    reviews: review?.updatedAt,
    movies: films,
    people: person?.updatedAt,
    topics: topic?.updatedAt,
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
