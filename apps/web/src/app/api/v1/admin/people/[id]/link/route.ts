import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { fetchRemoteImage, processImage } from "@/lib/media/image";
import { buildKey, deleteByUrl, putPublicObject } from "@/lib/media/storage";
import { getPersonDetail } from "@/lib/tmdb";

/**
 * Attach a searched-for identity to a person we hold, and take what it gives.
 *
 * One click after a search does the whole job: records the id so later
 * refreshes are unambiguous, pulls the portrait through our pipeline into our
 * storage, and fills the factual blanks — birth, death, birthplace — that we
 * would otherwise retype.
 *
 * `bio` is deliberately *not* filled from upstream. It is the field written in
 * our voice, and a page whose prose was pasted from a database has nothing of
 * ours on it. The dates are facts; the writing is the site.
 */

const idSchema = z.string().min(1).max(64);
const bodySchema = z.object({ tmdbId: z.coerce.number().int().positive() });

/** A YYYY-MM-DD from upstream, or null if it is not one. */
function day(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const POST = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { id } = await ctx.params;
  const personId = idSchema.parse(id);
  const { tmdbId } = bodySchema.parse(await parseJson(request));

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, image: true, birthDate: true, deathDate: true, birthPlace: true },
  });
  if (!person) throw new ApiError(404, "Person not found");

  // The unique index would answer this too, but a 409 that names the conflict is
  // more use than a constraint violation.
  const taken = await prisma.person.findFirst({
    where: { tmdbId, NOT: { id: personId } },
    select: { name: true, slug: true },
  });
  if (taken) {
    throw new ApiError(409, `That identity is already linked to ${taken.name} (/${taken.slug})`);
  }

  const detail = await getPersonDetail(tmdbId);

  // Portrait: pulled once, re-encoded, stored as ours. Failure here must not
  // lose the link — the identity is worth recording even without a face.
  let image = person.image;
  let portraitError: string | null = null;
  if (detail.profile_path) {
    try {
      const buf = await fetchRemoteImage(
        `https://image.tmdb.org/t/p/original${detail.profile_path}`,
      );
      const processed = await processImage(buf, { fullWidth: 640, square: true });
      const url = await putPublicObject(
        buildKey("people", processed.ext),
        processed.full.data,
        processed.contentType,
      );
      if (person.image && person.image !== url) await deleteByUrl(person.image);
      image = url;
    } catch (e) {
      portraitError = e instanceof Error ? e.message : "portrait import failed";
    }
  }

  const updated = await prisma.person.update({
    where: { id: personId },
    data: {
      tmdbId,
      tmdbProfilePath: detail.profile_path,
      image,
      // Fill-only: anything we already wrote or corrected stays.
      birthDate: person.birthDate ?? day(detail.birthday),
      deathDate: person.deathDate ?? day(detail.deathday),
      birthPlace: person.birthPlace ?? detail.place_of_birth,
    },
    select: {
      slug: true,
      name: true,
      image: true,
      birthDate: true,
      deathDate: true,
      birthPlace: true,
    },
  });

  return json({
    person: updated,
    portraitError,
    // What upstream had that we chose not to take, so the gap is a decision
    // rather than an oversight.
    skipped: detail.biography ? ["bio — ours to write"] : [],
  });
});
