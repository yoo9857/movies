import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { fetchRemoteImage, processImage } from "@/lib/media/image";
import { buildKey, deleteByUrl, putPublicObject } from "@/lib/media/storage";
import { enrich, searchPeople } from "@/lib/wikimedia";

/**
 * Attach a Wikipedia article to a person and take what it can honestly give.
 *
 * GET  — candidates for a name, so a human picks the right article.
 * POST — commit one: facts filled where blank, the photograph pulled through our
 *        pipeline with its credit, and the article's prose returned as a *draft*
 *        rather than saved.
 *
 * The fill-only rule is not politeness. Anything already on the row was either
 * written or corrected by a person, and an importer that overwrites a correction
 * makes the same mistake twice.
 */

const idSchema = z.string().min(1).max(64);

export const GET = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();

  const { id } = await ctx.params;
  const person = await prisma.person.findUnique({
    where: { id: idSchema.parse(id) },
    select: { name: true },
  });
  if (!person) throw new ApiError(404, "Person not found");

  const q = new URL(request.url).searchParams.get("q")?.trim();
  const candidates = await searchPeople(q || person.name);

  return json({
    query: q || person.name,
    candidates: candidates.map((c) => ({
      title: c.title,
      description: c.description,
      thumbnail: c.thumbnail,
      wikidataId: c.wikidataId,
      pageUrl: c.pageUrl,
    })),
  });
});

const commitSchema = z.object({ title: z.string().trim().min(1).max(200) });

export const POST = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { id } = await ctx.params;
  const personId = idSchema.parse(id);
  const { title } = commitSchema.parse(await parseJson(request));

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      id: true,
      image: true,
      birthDate: true,
      deathDate: true,
      birthPlace: true,
      deathPlace: true,
      occupations: true,
      imdbId: true,
    },
  });
  if (!person) throw new ApiError(404, "Person not found");

  const found = await enrich(title);
  if (!found) throw new ApiError(404, `No Wikipedia article for "${title}"`);

  if (found.candidate.wikidataId) {
    const clash = await prisma.person.findFirst({
      where: { wikidataId: found.candidate.wikidataId, NOT: { id: personId } },
      select: { name: true, slug: true },
    });
    if (clash) {
      throw new ApiError(409, `That article is already linked to ${clash.name} (/${clash.slug})`);
    }
  }

  // The photograph. Failure here must not lose the link: the identity and the
  // facts are worth recording even when the image cannot be fetched.
  let image = person.image;
  let imageCredit: string | null = null;
  let imageLicense: string | null = null;
  let imageLicenseUrl: string | null = null;
  let imageSourceUrl: string | null = null;
  let portraitError: string | null = null;

  if (found.image) {
    try {
      const buf = await fetchRemoteImage(found.image.url);
      const processed = await processImage(buf, { fullWidth: 640, square: true });
      const url = await putPublicObject(
        buildKey("people", processed.ext),
        processed.full.data,
        processed.contentType,
      );
      if (person.image && person.image !== url) await deleteByUrl(person.image);
      image = url;
      imageCredit = found.image.credit;
      imageLicense = found.image.license;
      imageLicenseUrl = found.image.licenseUrl;
      imageSourceUrl = found.image.sourceUrl;
    } catch (e) {
      portraitError = e instanceof Error ? e.message : "portrait import failed";
    }
  }

  const day = (value: string | null) => (value ? new Date(`${value}T00:00:00Z`) : null);

  const updated = await prisma.person.update({
    where: { id: personId },
    data: {
      wikidataId: found.candidate.wikidataId ?? undefined,
      wikipediaUrl: found.candidate.pageUrl,
      imdbId: person.imdbId ?? found.facts?.imdbId ?? null,
      // Fill-only for everything a person may have already fixed.
      birthDate: person.birthDate ?? day(found.facts?.birthDate ?? null),
      deathDate: person.deathDate ?? day(found.facts?.deathDate ?? null),
      birthPlace: person.birthPlace ?? found.facts?.birthPlace ?? null,
      deathPlace: person.deathPlace ?? found.facts?.deathPlace ?? null,
      occupations:
        person.occupations.length > 0 ? person.occupations : (found.facts?.occupations ?? []),
      ...(image !== person.image
        ? { image, imageCredit, imageLicense, imageLicenseUrl, imageSourceUrl }
        : {}),
    },
    select: {
      slug: true,
      name: true,
      image: true,
      imageCredit: true,
      imageLicense: true,
      birthDate: true,
      deathDate: true,
      birthPlace: true,
      deathPlace: true,
      occupations: true,
      wikidataId: true,
      wikipediaUrl: true,
      imdbId: true,
    },
  });

  return json({
    person: updated,
    portraitError,
    // Returned, never stored: Wikipedia prose is CC BY-SA and the bio is meant
    // to be written here. This is reference material for whoever writes it.
    bioDraft: found.bioDraft,
  });
});
