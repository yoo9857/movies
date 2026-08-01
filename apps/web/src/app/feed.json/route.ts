// GET /feed.json — JSON Feed 1.1.
//
// Same content as /feed.xml, in the format anything written this decade would
// rather parse. Worth publishing alongside RSS because it carries the fields RSS
// has to fake: a real author object, a separate summary and content, tags, and an
// image — no namespace extensions required.
//
// Spec: https://www.jsonfeed.org/version/1.1/
import { prisma } from "@cinepixo/db";
import { absUrl, clamp, hosted, plainText, posterUrl } from "@/lib/seo";
import { SITE_DESCRIPTION, SITE_LANG, SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const ITEMS = 30;

export async function GET(): Promise<Response> {
  // Reviews and topic essays, interleaved by date — the same two kinds of
  // published writing /feed.xml carries.
  const [reviews, topics] = await Promise.all([
    prisma.review.findMany({
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
        movie: { select: { title: true, releaseDate: true, posterPath: true, image: true, genres: true } },
      },
    }),
    prisma.topic.findMany({
      where: { essay: { not: null } },
      orderBy: { createdAt: "desc" },
      take: ITEMS,
      select: {
        slug: true,
        name: true,
        kind: true,
        description: true,
        essay: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

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
    items: buildItems(reviews, topics),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      "Content-Type": "application/feed+json; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=86400",
    },
  });
}

type ReviewRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  verdict: string | null;
  content: string;
  rating: number;
  publishedAt: Date | null;
  updatedAt: Date;
  author: { username: string; displayName: string | null };
  movie: {
    title: string;
    releaseDate: Date | null;
    posterPath: string | null;
    image: string | null;
    genres: string[];
  };
};

type TopicRow = {
  slug: string;
  name: string;
  kind: "THEME" | "MOTIF";
  description: string | null;
  essay: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function buildItems(reviews: ReviewRow[], topics: TopicRow[]) {
  const reviewItems = reviews.map((r) => {
    const url = absUrl(`/reviews/${r.slug}`);
    const author = r.author.displayName ?? r.author.username;
    const year = r.movie.releaseDate ? new Date(r.movie.releaseDate).getFullYear() : null;
    return {
      date: r.publishedAt ?? new Date(0),
      item: {
        id: url,
        url,
        title: r.title,
        summary: clamp(r.verdict ?? r.excerpt ?? plainText(r.content), 300),
        // Markdown, not HTML: the review's source form, which is also what the
        // .md endpoints serve. Anything rendering it should render Markdown.
        content_text: plainText(r.content),
        image: hosted(r.movie.image) ?? posterUrl(r.movie.posterPath, "w500"),
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
      },
    };
  });

  const topicItems = topics.map((t) => {
    const url = absUrl(`/topics/${t.slug}`);
    const kindLabel = t.kind === "THEME" ? "Theme" : "Motif";
    return {
      date: t.createdAt,
      item: {
        id: url,
        url,
        title: `${t.name} — a CinePixo ${kindLabel.toLowerCase()}`,
        summary: t.description ?? clamp(plainText(t.essay ?? ""), 300),
        content_text: plainText(t.essay ?? ""),
        date_published: t.createdAt.toISOString(),
        date_modified: t.updatedAt.toISOString(),
        // Editorial, not signed by one member: the site is the author.
        authors: [{ name: SITE_NAME }],
        tags: [kindLabel, "Topics"],
        _cinepixo: {
          kind: t.kind,
          markdown_url: `${url}.md`,
        },
      },
    };
  });

  return [...reviewItems, ...topicItems]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, ITEMS)
    .map((i) => i.item);
}
