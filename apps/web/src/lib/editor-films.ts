import { prisma } from "@cinepixo/db";
import type { PickerMovie } from "@/components/review/MoviePicker";

/**
 * The films a review editor opens with.
 *
 * Four pages render `ReviewEditor` — /write, /me/reviews/[id]/edit and the two
 * admin equivalents — and all four used to hand it `movie.findMany` with no
 * `take`: 118,811 rows, each with a stills subquery, serialised into the RSC
 * payload of a page any logged-in member could open. That is the same shape of
 * query that took the site down from the portrait desk on 2026-08-03.
 *
 * The picker searches `/api/v1/movies/search` now, so this is only a seed: enough
 * for the dropdown to show something before a keystroke, plus whichever film the
 * screen is already about. It lives here rather than in each page so the four
 * cannot drift apart again.
 */

const SEED = 40;

const FILM_SELECT = {
  id: true,
  title: true,
  releaseDate: true,
  director: true,
  trailerKey: true,
  images: {
    where: { kind: "backdrop" as const },
    orderBy: { sort: "asc" as const },
    select: { path: true },
    // The preview shows a handful of stills; carrying every backdrop of every
    // seeded film was most of the weight of the old query.
    take: 6,
  },
} as const;

type FilmRow = {
  id: string;
  title: string;
  releaseDate: Date | null;
  director: string | null;
  trailerKey: string | null;
  images: { path: string }[];
};

const toPicker = (m: FilmRow): PickerMovie => ({
  id: m.id,
  title: m.title,
  year: m.releaseDate ? new Date(m.releaseDate).getUTCFullYear() : null,
  director: m.director,
  trailerKey: m.trailerKey,
  stills: m.images.map((i) => i.path),
});

/**
 * Newest first, because on a library fed by import that is where anything worth
 * writing about has just arrived — and, when `includeId` names a film, that film,
 * whether or not it is recent. An edit screen has to be able to name its own
 * subject without a request, and `/write?movie=…` has to be able to preselect one.
 */
export async function editorSeedFilms(includeId?: string | null): Promise<PickerMovie[]> {
  const [recent, pinned] = await Promise.all([
    prisma.movie.findMany({
      orderBy: { createdAt: "desc" },
      take: SEED,
      select: FILM_SELECT,
    }),
    includeId
      ? prisma.movie.findUnique({ where: { id: includeId }, select: FILM_SELECT })
      : Promise.resolve(null),
  ]);

  const seeded = recent.map(toPicker);
  if (pinned && !seeded.some((m) => m.id === pinned.id)) {
    // First, so an edit screen's own film is the head of the resting dropdown.
    seeded.unshift(toPicker(pinned));
  }
  return seeded;
}
