// GET /movies/{id}.md — the film, its credits, and the criticism on it.
//
// Same contract as the review endpoint: a clean document rather than a page, and
// deliberately outside /api/ so robots.txt does not disallow it.
import { prisma } from "@cinepixo/db";
import { markdownResponse, movieToMarkdown, notFoundMarkdown } from "@/lib/markdown-export";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{1,64}$/i.test(id)) return notFoundMarkdown();

  const movie = await prisma.movie.findUnique({
    where: { id },
    include: {
      cast: { orderBy: { order: "asc" }, take: 15 },
      crew: true,
      reviews: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        select: {
          slug: true,
          title: true,
          rating: true,
          verdict: true,
          publishedAt: true,
          author: { select: { username: true, displayName: true } },
        },
      },
    },
  });
  if (!movie) return notFoundMarkdown();

  return markdownResponse(movieToMarkdown(movie));
}
