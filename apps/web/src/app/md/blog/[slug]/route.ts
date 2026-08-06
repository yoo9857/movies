import { prisma } from "@cinepixo/db";
import { POST_CATEGORY_LABELS } from "@cinepixo/shared";
import { markdownResponse, notFoundMarkdown, postToMarkdown } from "@/lib/markdown-export";

// Served at /blog/{slug}.md via the rewrite in next.config.ts. A route handler,
// so — unlike the streamed page — a missing slug is a real 404.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,130}$/.test(slug)) return notFoundMarkdown();

  const post = await prisma.post.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      author: { select: { username: true, displayName: true } },
      people: { orderBy: { sort: "asc" }, select: { person: { select: { slug: true, name: true } } } },
      movies: {
        orderBy: { sort: "asc" },
        select: { movie: { select: { slug: true, title: true, releaseDate: true } } },
      },
    },
  });
  if (!post) return notFoundMarkdown();

  return markdownResponse(
    postToMarkdown({
      slug: post.slug,
      title: post.title,
      dek: post.dek,
      content: post.content,
      categoryLabel: POST_CATEGORY_LABELS[post.category],
      tags: post.tags,
      sources: post.sources,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      author: post.author,
      people: post.people.map((p) => p.person),
      films: post.movies.map((m) => ({
        slug: m.movie.slug,
        title: m.movie.title,
        year: m.movie.releaseDate ? m.movie.releaseDate.getUTCFullYear() : null,
      })),
    }),
    { canonicalPath: `/blog/${post.slug}` },
  );
}
