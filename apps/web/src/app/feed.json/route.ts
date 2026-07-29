// GET /feed.json — JSON Feed 1.1.
//
// Same content as /feed.xml, in the format anything written this decade would
// rather parse. Worth publishing alongside RSS because it carries the fields RSS
// has to fake: a real author object, a separate summary and content, tags, and an
// image — no namespace extensions required.
//
// Spec: https://www.jsonfeed.org/version/1.1/
import { prisma } from "@cinepixo/db";
import { absUrl, clamp, plainText, posterUrl } from "@/lib/seo";
import { SITE_DESCRIPTION, SITE_LANG, SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const ITEMS = 30;

export async function GET(): Promise<Response> {
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
      updatedAt: true,
      author: { select: { username: true, displayName: true } },
      movie: { select: { title: true, releaseDate: true, posterPath: true, genres: true } },
    },
  });

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: SITE_NAME,
    home_page_url: `${SITE_URL}/`,
    feed_url: absUrl("/feed.json"),
    description: SITE_DESCRIPTION,
    language: SITE_LANG,
    icon: absUrl("/icon-512.png"),
    favicon: absUrl("/icon-192.png"),
    authors: [{ name: SITE_NAME, url: `${SITE_URL}/` }],
    items: reviews.map((r) => {
      const url = absUrl(`/reviews/${r.slug}`);
      const author = r.author.displayName ?? r.author.username;
      const year = r.movie.releaseDate ? new Date(r.movie.releaseDate).getFullYear() : null;
      return {
        id: url,
        url,
        title: r.title,
        summary: clamp(r.verdict ?? r.excerpt ?? plainText(r.content), 300),
        // Markdown, not HTML: the review's source form, which is also what the
        // .md endpoints serve. Anything rendering it should render Markdown.
        content_text: plainText(r.content),
        image: posterUrl(r.movie.posterPath, "w500"),
        date_published: r.publishedAt?.toISOString(),
        date_modified: r.updatedAt.toISOString(),
        authors: [{ name: author }],
        tags: [
          r.movie.title,
          ...(year ? [String(year)] : []),
          ...r.movie.genres,
          `${r.rating.toFixed(1)}/10`,
        ],
        // Extensions are namespaced with a leading underscore, per the spec.
        _cinepixo: {
          rating_out_of_10: r.rating,
          rating_stars_out_of_5: Math.round((r.rating / 2) * 100) / 100,
          film: r.movie.title,
          film_year: year,
          markdown_url: `${url}.md`,
        },
      };
    }),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      "Content-Type": "application/feed+json; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=86400",
    },
  });
}
