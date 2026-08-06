// GET /blog/feed.xml — RSS 2.0, Off Camera only.
//
// The site feed carries three kinds of writing interleaved: signed reviews,
// blog posts, and topic essays. That is right for someone following CinePixo
// and wrong for someone following *the blog* — they were being handed a
// scored argument about a film they had not asked about, in among the pieces
// they had. A publication with a named section owes that section its own feed.
//
// Same shape as /feed.xml deliberately, minus the rating (a post has no score)
// and with the shelf as the leading category, so a reader can filter by it.
import { prisma } from "@cinepixo/db";
import { POST_CATEGORY_LABELS } from "@cinepixo/shared";
import { exportMarkdownBody } from "@/lib/markdown-export";
import { absUrl, clamp, hosted, plainText } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Same reason as the site feed: it must reflect what is published right now.
export const dynamic = "force-dynamic";

const ITEMS = 30;

const TITLE = `Off Camera — the ${SITE_NAME} blog`;
const DESCRIPTION =
  "Film writing that isn't a review: the people who make pictures away from the picture, " +
  "the arguments the industry is having, how the work gets done, and what to watch next.";

function xml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** The `]]>` split is not paranoia: a post quoting XML would close the section early. */
function cdata(s: string): string {
  return `<![CDATA[${s.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

/** The body with the citations the page prints, appended the same way. */
function withSources(body: string, sources: string[]): string {
  if (sources.length === 0) return body;
  return [
    body.trimEnd(),
    "",
    "## Sources",
    "",
    ...sources.map((s) => `- ${s}`),
    "",
    "Every factual claim above is drawn from these. The reading of them is ours.",
  ].join("\n");
}

export async function GET() {
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: ITEMS,
    select: {
      slug: true,
      title: true,
      dek: true,
      content: true,
      category: true,
      tags: true,
      sources: true,
      image: true,
      publishedAt: true,
      author: { select: { username: true, displayName: true } },
    },
  });

  const items = posts
    .map((p) => {
      const url = absUrl(`/blog/${p.slug}`);
      const author = p.author.displayName ?? p.author.username;
      const summary = clamp(p.dek ?? plainText(p.content), 400) ?? p.title;
      const hero = hosted(p.image);

      return [
        "    <item>",
        `      <title>${xml(p.title)}</title>`,
        `      <link>${xml(url)}</link>`,
        `      <guid isPermaLink="true">${xml(url)}</guid>`,
        `      <description>${xml(summary)}</description>`,
        // The body *and its citations*. `Post_claims_are_sourced` refuses to
        // publish a PEOPLE or ISSUE piece without them, and a surface that
        // reprints the whole piece while dropping them is the lie that
        // constraint exists to prevent — this feed hands a reader the full
        // text, so it owes them the same footnotes the page prints.
        `      <content:encoded>${cdata(withSources(exportMarkdownBody(p.content), p.sources))}</content:encoded>`,
        `      <dc:creator>${xml(author)}</dc:creator>`,
        `      <category>${xml(POST_CATEGORY_LABELS[p.category])}</category>`,
        ...p.tags.map((t) => `      <category>${xml(t)}</category>`),
        p.publishedAt ? `      <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>` : "",
        hero
          ? `      <media:thumbnail url="${xml(hero)}" />\n      <enclosure url="${xml(hero)}" type="${hero.endsWith(".webp") ? "image/webp" : "image/jpeg"}" length="0" />`
          : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const newest = posts[0]?.publishedAt;

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/feed.xsl"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${xml(TITLE)}</title>
    <link>${xml(absUrl("/blog"))}</link>
    <atom:link href="${xml(absUrl("/blog/feed.xml"))}" rel="self" type="application/rss+xml" />
    <atom:link href="${xml(absUrl("/feed.xml"))}" rel="alternate" type="application/rss+xml" />
    <description>${xml(DESCRIPTION)}</description>
    <language>en-us</language>
    <copyright>${xml(`© ${SITE_NAME}. Photographs carry their own licences.`)}</copyright>
    <generator>CinePixo</generator>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <ttl>60</ttl>
${newest ? `    <lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>\n` : ""}    <image>
      <url>${xml(absUrl("/icon-512.png"))}</url>
      <title>${xml(TITLE)}</title>
      <link>${xml(`${SITE_URL}/blog`)}</link>
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
