import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { handle, json, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { fetchRemoteImage, processImage } from "@/lib/media/image";
import { buildKey, deleteByUrl, putPublicObject } from "@/lib/media/storage";
import { enrich, searchPeople } from "@/lib/wikimedia";

/**
 * Enrich everyone who can be matched without a judgement call.
 *
 * The obvious implementation — take the first search result — is the exact bug
 * this codebase already shipped once: the seeded profile paths were "verified"
 * by checking that the URL returned an image, which is how a photograph of a
 * stranger ended up on Michael Caine's card. A confident-looking wrong answer is
 * worse than no answer, so this only commits a match it can defend, and reports
 * everything else for a person to settle in the picker.
 *
 * Two conditions, both required:
 *
 *   1. the article title *is* the name — identical once case, accents and
 *      punctuation are normalised, or the name plus a parenthetical
 *      disambiguator ("Michael Caine (actor)")
 *   2. Wikipedia's own one-line description places them in film
 *
 * Anything else — a near-match, a person with no description, a description
 * about a footballer who shares the name — is skipped with its reason.
 */

const bodySchema = z.object({
  // Each person costs a search, a summary, two Wikidata calls and an image
  // re-encode. A batch is bounded so the request finishes.
  limit: z.coerce.number().int().min(1).max(15).default(8),
});

/** Case, accents and punctuation are not identity. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const FILM_WORDS = [
  "actor", "actress", "film", "director", "filmmaker", "screenwriter",
  "cinematographer", "producer", "composer", "editor", "animator",
  "voice", "writer", "playwright", "novelist",
];

interface Verdict {
  title: string;
  ok: boolean;
  reason: string;
}

/** Decide whether a candidate is defensibly the same person. */
function judge(name: string, candidate: { title: string; description: string | null }): Verdict {
  const wanted = normalise(name);
  const got = normalise(candidate.title);

  // "Michael Caine (actor)" → the parenthetical is a disambiguator, not a name.
  const withoutParenthetical = normalise(candidate.title.replace(/\s*\([^)]*\)\s*$/, ""));

  if (got !== wanted && withoutParenthetical !== wanted) {
    return { title: candidate.title, ok: false, reason: `title is "${candidate.title}", not the name` };
  }
  if (!candidate.description) {
    return { title: candidate.title, ok: false, reason: "no description to check against" };
  }
  const desc = candidate.description.toLowerCase();
  if (!FILM_WORDS.some((w) => desc.includes(w))) {
    return {
      title: candidate.title,
      ok: false,
      reason: `description is not film-related: "${candidate.description}"`,
    };
  }
  return { title: candidate.title, ok: true, reason: candidate.description };
}

export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { limit } = bodySchema.parse(
    await request.json().catch(() => ({}) as Record<string, unknown>),
  );

  // Never looked up before, and actually credited on something.
  const pending = await prisma.person.findMany({
    where: {
      wikidataId: null,
      OR: [{ castRoles: { some: {} } }, { crewRoles: { some: {} } }],
    },
    select: { id: true, name: true, image: true },
    orderBy: { name: "asc" },
    take: limit,
  });

  const linked: { name: string; article: string; photo: boolean }[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const person of pending) {
    try {
      const candidates = await searchPeople(person.name, 4);
      if (candidates.length === 0) {
        skipped.push({ name: person.name, reason: "no Wikipedia article found" });
        continue;
      }

      // The best defensible candidate, not the highest-ranked one.
      const accepted = candidates
        .map((c) => ({ candidate: c, verdict: judge(person.name, c) }))
        .find((x) => x.verdict.ok);

      if (!accepted) {
        skipped.push({
          name: person.name,
          reason: judge(person.name, candidates[0]).reason,
        });
        continue;
      }

      const found = await enrich(accepted.candidate.title);
      if (!found) {
        skipped.push({ name: person.name, reason: "article vanished between search and fetch" });
        continue;
      }

      // Someone else already claims this identity — a merge to settle by hand.
      if (found.candidate.wikidataId) {
        const clash = await prisma.person.findFirst({
          where: { wikidataId: found.candidate.wikidataId, NOT: { id: person.id } },
          select: { name: true },
        });
        if (clash) {
          skipped.push({ name: person.name, reason: `article already linked to ${clash.name}` });
          continue;
        }
      }

      let image = person.image;
      let credit: {
        imageCredit: string | null;
        imageLicense: string | null;
        imageLicenseUrl: string | null;
        imageSourceUrl: string | null;
      } | null = null;

      if (found.image && !person.image) {
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
          credit = {
            imageCredit: found.image.credit,
            imageLicense: found.image.license,
            imageLicenseUrl: found.image.licenseUrl,
            imageSourceUrl: found.image.sourceUrl,
          };
        } catch {
          // The identity and the facts are still worth recording.
        }
      }

      const day = (value: string | null) => (value ? new Date(`${value}T00:00:00Z`) : null);

      await prisma.person.update({
        where: { id: person.id },
        data: {
          wikidataId: found.candidate.wikidataId ?? undefined,
          wikipediaUrl: found.candidate.pageUrl,
          imdbId: found.facts?.imdbId ?? null,
          birthDate: day(found.facts?.birthDate ?? null),
          deathDate: day(found.facts?.deathDate ?? null),
          birthPlace: found.facts?.birthPlace ?? null,
          occupations: found.facts?.occupations ?? [],
          ...(image !== person.image ? { image, ...credit } : {}),
        },
      });

      linked.push({
        name: person.name,
        article: found.candidate.title,
        photo: image !== person.image,
      });
    } catch (e) {
      skipped.push({
        name: person.name,
        reason: e instanceof Error ? e.message : "unknown error",
      });
    }
  }

  const remaining = await prisma.person.count({
    where: {
      wikidataId: null,
      OR: [{ castRoles: { some: {} } }, { crewRoles: { some: {} } }],
    },
  });

  return json({ linked, skipped, remaining });
});
