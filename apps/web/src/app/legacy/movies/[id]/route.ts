// The 308 for pre-slug movie URLs.
//
// Requests for /movies/<cuid> are rewritten here (see next.config.ts) because
// a route handler answers before anything streams — it is the only place left
// that can put 308 on the status line. The page's own redirect still exists as
// a fallback for browsers, but crawlers need the status code, and moving every
// movie URL is pointless if the search index never hears about it.
import { prisma } from "@cinepixo/db";
import { NextResponse } from "next/server";
import { absUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^c[a-z0-9]{24}$/.test(id)) return new NextResponse(null, { status: 404 });

  const movie = await prisma.movie.findUnique({ where: { id }, select: { slug: true } });
  if (!movie) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(absUrl(`/movies/${movie.slug}`), 308);
}
