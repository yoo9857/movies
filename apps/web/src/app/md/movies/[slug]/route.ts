// GET /movies/{slug}.md — the film, its credits, and the criticism on it.
//
// Same contract as the review endpoint: a clean document rather than a page, and
// deliberately outside /api/ so robots.txt does not disallow it.
import { prisma } from "@cinepixo/db";
import { markdownResponse, movieToMarkdown, notFoundMarkdown } from "@/lib/markdown-export";
import { absUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

const include = {
  cast: {
    orderBy: { order: "asc" as const },
    take: 15,
    include: { person: { select: { slug: true } } },
  },
  crew: { include: { person: { select: { slug: true } } } },
  topics: {
    // Same order the film page shows: themes first, alphabetical within.
    orderBy: [{ topic: { kind: "asc" as const } }, { topic: { name: "asc" as const } }],
    select: { note: true, topic: { select: { slug: true, name: true, kind: true } } },
  },
  reviews: {
    where: { status: "PUBLISHED" as const },
    orderBy: { publishedAt: "desc" as const },
    select: {
      slug: true,
      title: true,
      rating: true,
      verdict: true,
      publishedAt: true,
      author: { select: { username: true, displayName: true } },
    },
  },
};

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,130}$/i.test(slug)) return notFoundMarkdown();

  // Slug first; id keeps pre-slug URLs alive with a 301 to the real document.
  const movie =
    (await prisma.movie.findUnique({ where: { slug }, include })) ??
    (await prisma.movie.findUnique({ where: { id: slug }, include }));
  if (!movie) return notFoundMarkdown();
  if (movie.slug !== slug) {
    return Response.redirect(absUrl(`/movies/${movie.slug}.md`), 301);
  }

  return markdownResponse(
    movieToMarkdown({
      ...movie,
      cast: movie.cast.map((c) => ({ ...c, personSlug: c.person?.slug })),
      crew: movie.crew.map((c) => ({ ...c, personSlug: c.person?.slug })),
      topics: movie.topics.map((mt) => ({ ...mt.topic, note: mt.note })),
    }),
  );
}
