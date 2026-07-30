import { prisma } from "@cinepixo/db";
import { ImageResponse } from "next/og";
import { OG_CONTENT_TYPE, OG_SIZE, ReviewCard, ogFontOptions } from "@/lib/og-card";
import { posterUrl } from "@/lib/seo";

// A share card per review, not one image for the whole site.
export const alt = "A film review on CinePixo";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Reviews are edited; a card cached against an old title is worse than the
// render cost of drawing it again.
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const review = await prisma.review.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      title: true,
      verdict: true,
      excerpt: true,
      rating: true,
      author: { select: { username: true, displayName: true } },
      movie: { select: { title: true, releaseDate: true, posterPath: true } },
    },
  });

  // A missing or unpublished review still needs *an* image — the wordmark card
  // is honest and keeps the crawler from getting a 404 where it expects a PNG.
  if (!review) {
    return new ImageResponse(
      ReviewCard({
        title: "CinePixo",
        verdict: "A fandom home for lovers of film criticism.",
        rating: 0,
        author: "CinePixo",
        film: "Film criticism",
      }),
      await ogFontOptions(),
    );
  }

  return new ImageResponse(
    ReviewCard({
      title: review.title,
      // The verdict is the author's own one-line conclusion — the best sentence
      // to put in a preview. The excerpt is the fallback.
      verdict: review.verdict ?? review.excerpt,
      rating: review.rating,
      author: review.author.displayName ?? review.author.username,
      film: review.movie.title,
      year: review.movie.releaseDate ? new Date(review.movie.releaseDate).getFullYear() : null,
      poster: posterUrl(review.movie.posterPath, "w500"),
    }),
    await ogFontOptions(),
  );
}
