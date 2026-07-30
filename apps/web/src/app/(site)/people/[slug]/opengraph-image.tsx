import { prisma } from "@cinepixo/db";
import { toStarScale } from "@cinepixo/shared";
import { ImageResponse } from "next/og";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  PersonCard,
  ogFontOptions,
  ourImageAsPng,
} from "@/lib/og-card";
import { absUrl } from "@/lib/seo";

export const alt = "Someone in the CinePixo library";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const person = await prisma.person.findUnique({
    where: { slug },
    select: {
      name: true,
      image: true,
      castRoles: {
        select: {
          movieId: true,
          movie: {
            select: { reviews: { where: { status: "PUBLISHED" }, select: { rating: true } } },
          },
        },
      },
      crewRoles: {
        select: {
          movieId: true,
          job: true,
          movie: {
            select: { reviews: { where: { status: "PUBLISHED" }, select: { rating: true } } },
          },
        },
      },
    },
  });

  if (!person) {
    return new ImageResponse(
      PersonCard({ name: "CinePixo", filmCount: 0, reviewCount: 0 }),
      await ogFontOptions(),
    );
  }

  // One rating set per film, so someone who wrote and directed the same film is
  // not counted twice.
  const films = new Map<string, number[]>();
  for (const c of [...person.castRoles, ...person.crewRoles]) {
    films.set(c.movieId, c.movie.reviews.map((r) => r.rating));
  }
  const ratings = [...films.values()].flat();
  const average =
    ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;
  const jobs = [...new Set(person.crewRoles.map((c) => c.job))];

  return new ImageResponse(
    PersonCard({
      name: person.name,
      role: jobs[0] ?? (person.castRoles.length > 0 ? "Actor" : null),
      filmCount: films.size,
      reviewCount: ratings.length,
      fandomStars: average != null ? toStarScale(average) : null,
      // Only our own object, re-encoded to PNG: satori cannot decode the WebP
      // our pipeline stores. Null here simply falls back to the monogram.
      portrait: person.image ? await ourImageAsPng(absUrl(person.image), 420) : null,
    }),
    await ogFontOptions(),
  );
}
