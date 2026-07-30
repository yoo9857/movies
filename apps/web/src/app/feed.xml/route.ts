// GET /feed.xml — RSS 2.0.
//
// The plain channel a reader validated against was missing the parts that make a
// feed useful once something else consumes it: `atom:link rel="self"` (so a
// reader can find the feed again after the page linking to it moves), a real
// author via dc:creator, the rating, and an image per item. RSS has no fields for
// most of that, hence the three namespaces.
//
// See /feed.json for the same content without the namespace gymnastics.
import { prisma } from "@cinepixo/db";
import { exportMarkdownBody } from "@/lib/markdown-export";
import { absUrl, clamp, plainText, posterUrl } from "@/lib/seo";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// A feed must reflect what is published right now, and building it at deploy
// time would freeze it — and would need a database during the build.
export const dynamic = "force-dynamic";

const ITEMS = 30;

// Escape user content for XML — feed output must never break out of tags.
function xml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * CDATA for the one field that carries markup. The `]]>` split is not paranoia:
 * a review quoting XML would otherwise close the section early and corrupt the
 * rest of the feed.
 */
function cdata(s: string): string {
  return `<![CDATA[${s.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

export async function GET() {
  const reviews = await prisma.review.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: ITEMS,
    select: {
      slug: true,
      title: true,
      excerpt: true,
      verdict: true,
      content: true,
      rating: true,
      publishedAt: true,
      author: { select: { username: true, displayName: true } },
      movie: { select: { title: true, releaseDate: true, posterPath: true, genres: true } },
    },
  });

  const items = reviews
    .map((r) => {
      const url = absUrl(`/reviews/${r.slug}`);
      const author = r.author.displayName ?? r.author.username;
      const summary = clamp(r.verdict ?? r.excerpt ?? plainText(r.content), 400) ?? r.title;
      const poster = posterUrl(r.movie.posterPath, "w342");
      const year = r.movie.releaseDate ? new Date(r.movie.releaseDate).getFullYear() : null;

      return [
        "    <item>",
        `      <title>${xml(r.title)}</title>`,
        `      <link>${xml(url)}</link>`,
        `      <guid isPermaLink="true">${xml(url)}</guid>`,
        `      <description>${xml(summary)}</description>`,
        // The piece itself. Markdown, which is the form it is written and served
        // in — see the .md endpoints. Normalised for life outside this origin:
        // directives translated, relative URLs made absolute.
        `      <content:encoded>${cdata(exportMarkdownBody(r.content))}</content:encoded>`,
        `      <dc:creator>${xml(author)}</dc:creator>`,
        `      <category>${xml(r.movie.title)}</category>`,
        ...r.movie.genres.map((g) => `      <category>${xml(g)}</category>`),
        r.publishedAt ? `      <pubDate>${new Date(r.publishedAt).toUTCString()}</pubDate>` : "",
        poster
          ? `      <media:thumbnail url="${xml(poster)}" />\n      <enclosure url="${xml(poster)}" type="image/jpeg" length="0" />`
          : "",
        `      <media:rating scheme="urn:cinepixo">${r.rating.toFixed(1)}/10</media:rating>`,
        year ? `      <media:keywords>${xml(`${r.movie.title}, ${year}`)}</media:keywords>` : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const newest = reviews[0]?.publishedAt;

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${xml(SITE_NAME)}</title>
    <link>${xml(`${SITE_URL}/`)}</link>
    <atom:link href="${xml(absUrl("/feed.xml"))}" rel="self" type="application/rss+xml" />
    <atom:link href="${xml(absUrl("/feed.json"))}" rel="alternate" type="application/feed+json" />
    <description>${xml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <copyright>${xml(`Reviews © their authors. Published by ${SITE_NAME}.`)}</copyright>
    <generator>CinePixo</generator>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <ttl>60</ttl>
${newest ? `    <lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>\n` : ""}    <image>
      <url>${xml(absUrl("/icon-512.png"))}</url>
      <title>${xml(SITE_NAME)}</title>
      <link>${xml(`${SITE_URL}/`)}</link>
    </image>
${items}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=86400",
    },
  });
}
