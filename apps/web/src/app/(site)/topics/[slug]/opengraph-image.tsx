import { prisma } from "@cinepixo/db";
import { ImageResponse } from "next/og";
import { OG_CONTENT_TYPE, OG_SIZE, TopicCard, ogFontOptions } from "@/lib/og-card";
import { posterUrl } from "@/lib/seo";

/**
 * The share card for one axis of the taxonomy.
 *
 * The term, its definition and three posters: the same claim-plus-evidence
 * shape as the page, small enough to read at thumbnail size. The film count
 * moves as assignments land, so the card is drawn per request.
 */

export const alt = "An editorial axis of the CinePixo library";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const topic = /^[a-z0-9-]{1,130}$/.test(slug)
    ? await prisma.topic.findUnique({
        where: { slug },
        select: {
          name: true,
          kind: true,
          description: true,
          movies: {
            orderBy: { createdAt: "asc" },
            select: { movie: { select: { posterPath: true } } },
          },
        },
      })
    : null;

  // A card still has to come back for a slug that no longer resolves — a
  // scraper that gets a 404 here shows the sharer a broken image, not a 404.
  if (!topic) {
    return new ImageResponse(
      TopicCard({
        name: "Topics & Motifs",
        kind: "THEME",
        description:
          "The editorial axes of the library: themes a film is about, motifs that recur on screen.",
        filmCount: 0,
        posters: [],
      }),
      await ogFontOptions(),
    );
  }

  // w185 is the size the card draws at (92×138); anything larger is bytes the
  // renderer downsamples and throws away.
  const posters = topic.movies
    .map((m) => posterUrl(m.movie.posterPath, "w185"))
    .filter((url): url is string => Boolean(url))
    .slice(0, 3);

  return new ImageResponse(
    TopicCard({
      name: topic.name,
      kind: topic.kind,
      description: topic.description,
      filmCount: topic.movies.length,
      posters,
    }),
    await ogFontOptions(),
  );
}
