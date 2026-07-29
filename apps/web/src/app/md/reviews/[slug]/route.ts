// GET /reviews/{slug}.md — the review, as Markdown.
//
// Reachable two ways: here at /md/reviews/{slug}, and at /reviews/{slug}.md via
// the rewrite in next.config.ts. The rewritten form is the one advertised in the
// page's `rel="alternate"` link, because "append .md to the URL" is the
// convention answer engines and doc tools already try.
//
// Not under /api/, on purpose: robots.txt disallows that prefix, and this is a
// document meant to be crawled.
import { prisma } from "@cinepixo/db";
import { slugSchema } from "@cinepixo/shared";
import { markdownResponse, notFoundMarkdown, reviewToMarkdown } from "@/lib/markdown-export";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return notFoundMarkdown();

  // Drafts are not published in any format.
  const review = await prisma.review.findFirst({
    where: { slug: parsed.data, status: "PUBLISHED" },
    include: {
      author: { select: { username: true, displayName: true } },
      movie: true,
    },
  });
  if (!review) return notFoundMarkdown();

  return markdownResponse(reviewToMarkdown(review));
}
