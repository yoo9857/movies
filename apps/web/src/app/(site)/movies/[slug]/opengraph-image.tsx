import { prisma } from "@cinepixo/db";
import { toStarScale } from "@cinepixo/shared";
import { ImageResponse } from "next/og";
import { MovieCard, OG_CONTENT_TYPE, OG_SIZE, ogFontOptions, ourImageAsPng } from "@/lib/og-card";
import { absUrl, posterUrl } from "@/lib/seo";

export const alt = "A film in the CinePixo library";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// The fandom score moves as reviews land, so the card is drawn per request.
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Slug first, id second — same rule as the page, so a shared legacy URL still
  // produces the right card instead of the fallback.
  const select = {
    title: true,
    releaseDate: true,
    director: true,
    posterPath: true,
    image: true,
    crew: { where: { job: "Director" }, select: { name: true } },
    reviews: { where: { status: "PUBLISHED" as const }, select: { rating: true } },
  };
  const movie =
    (await prisma.movie.findUnique({ where: { slug }, select })) ??
    (await prisma.movie.findUnique({ where: { id: slug }, select }));

  if (!movie) {
    return new ImageResponse(
      MovieCard({ title: "CinePixo", reviewCount: 0 }),
      await ogFontOptions(),
    );
  }

  const ratings = movie.reviews.map((r) => r.rating);
  const average =
    ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;

  return new ImageResponse(
    MovieCard({
      title: movie.title,
      year: movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null,
      // The crew table is authoritative; the column is the pre-crew fallback.
      director: movie.crew[0]?.name ?? movie.director,
      fandomStars: average != null ? toStarScale(average) : null,
      reviewCount: ratings.length,
      // Our own file when we have one — but re-encoded to PNG first: the upload
      // pipeline writes WebP, which satori cannot decode, and a card with a blank
      // plate where the poster should be is worse than one without a plate.
      poster: movie.image
        ? await ourImageAsPng(absUrl(movie.image), 500)
        : posterUrl(movie.posterPath, "w500"),
    }),
    await ogFontOptions(),
  );
}
