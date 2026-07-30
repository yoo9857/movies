import { prisma } from "@cinepixo/db";
import { ImageResponse } from "next/og";
import { OG_CONTENT_TYPE, OG_SIZE, SiteCard, ogFontOptions } from "@/lib/og-card";
import { SITE_TAGLINE } from "@/lib/site";

/**
 * The site card, as one handler re-exported by every segment that needs it.
 *
 * File-based Open Graph images do **not** inherit into child segments — verified
 * against a production build: `(site)/opengraph-image.tsx` gave the home page a
 * card and left `/reviews`, `/movies`, `/people`, `/critics` and `/stats` with
 * none. So each listing segment gets its own three-line file that re-exports
 * this, which keeps the card in one place while satisfying the convention's
 * per-segment rule.
 *
 * Segments with something specific to say — a review, a film, a person — export
 * their own card instead and never touch this.
 */

export const alt = "CinePixo — a fandom home for lovers of film criticism";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function siteOgImage() {
  const [reviews, films, people] = await Promise.all([
    prisma.review.count({ where: { status: "PUBLISHED" } }),
    prisma.movie.count(),
    prisma.person.count({
      where: { OR: [{ castRoles: { some: {} } }, { crewRoles: { some: {} } }] },
    }),
  ]);

  return new ImageResponse(
    SiteCard({ tagline: SITE_TAGLINE, reviews, films, people }),
    await ogFontOptions(),
  );
}
