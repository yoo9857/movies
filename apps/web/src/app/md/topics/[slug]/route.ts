import { prisma } from "@cinepixo/db";
import { markdownResponse, notFoundMarkdown, topicToMarkdown } from "@/lib/markdown-export";

// Served at /topics/{slug}.md via the rewrite in next.config.ts. A route
// handler, so — unlike the streamed page — a missing slug is a real 404.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,130}$/.test(slug)) return notFoundMarkdown();

  const topic = await prisma.topic.findUnique({
    where: { slug },
    include: {
      movies: {
        orderBy: { sort: "asc" },
        include: {
          movie: {
            select: {
              slug: true,
              title: true,
              releaseDate: true,
              reviews: { where: { status: "PUBLISHED" }, select: { rating: true } },
            },
          },
        },
      },
    },
  });
  if (!topic) return notFoundMarkdown();

  const films = topic.movies.map((mt) => {
    const ratings = mt.movie.reviews.map((r) => r.rating);
    return {
      slug: mt.movie.slug,
      title: mt.movie.title,
      year: mt.movie.releaseDate ? mt.movie.releaseDate.getUTCFullYear() : null,
      note: mt.note,
      average: ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null,
      reviewCount: ratings.length,
    };
  });

  return markdownResponse(
    topicToMarkdown({
      slug: topic.slug,
      name: topic.name,
      kind: topic.kind,
      description: topic.description,
      essay: topic.essay,
      updatedAt: topic.updatedAt,
      films,
    }),
  );
}
