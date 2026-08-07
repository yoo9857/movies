// Portraits for the people the credit import created, from Wikimedia — onto our
// own storage, with the credit and licence the licence requires.
//
//   cd apps/web && npx tsx scripts/import-portraits.ts --limit=500
//   npm run portraits -w web -- --limit=500        # from the repo root
//   npm run portraits -w web -- --offset=20 --limit=50  # skip known no-photo rows
//
// This is the admin portrait desk's "enrich" button, run over a queue instead of
// one row at a time. It deliberately reuses the same three modules the route
// does — `wikimedia`, `media/image`, `media/storage` — because the value of a
// portrait here is that it is *ours*: fetched once, re-encoded to the sizes this
// site serves, stored on our own origin, and carrying the photographer's credit
// and the licence terms. A hotlinked thumbnail would be none of those things.
//
// It lives under apps/web rather than packages/db for the same reason: that
// pipeline is the app's, and duplicating it in a seed script is how two versions
// of "how we store an image" start to drift.
//
// Not written here: `bio`. Wikipedia prose is CC BY-SA and the schema says the
// prose is the site's own; the article link is stored so whoever writes it has
// the source to hand.
import "../../../packages/db/prisma/env";
import { prisma } from "@cinepixo/db";
import { fetchRemoteImage, processImage } from "@/lib/media/image";
import { buildKey, putPublicObject } from "@/lib/media/storage";
import { enrich } from "@/lib/wikimedia";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

const LIMIT = arg("limit", 200);
const OFFSET = arg("offset", 0);
/**
 * Milliseconds between people. Wikimedia is free and shared; serial and slow.
 *
 * 700ms drew 429s from upload.wikimedia.org on one run in four — the image host
 * throttles harder than the API does, and a portrait fetch is a megabyte or two.
 */
const PACE = arg("pace", 1500);
const DRY = process.argv.includes("--dry");

/**
 * Three tries with a widening pause, for the one error worth retrying.
 *
 * A 429 from the image host means "not yet", not "no" — and losing a portrait to
 * it wastes the article lookup that found it. Anything else (a 404, an image
 * sharp cannot decode) fails immediately, because a second attempt would fail
 * the same way.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const throttled = /\b429\b|too many requests/i.test((e as Error).message);
      if (!throttled || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, attempt * 8_000));
    }
  }
}

/** "https://en.wikipedia.org/wiki/Song_Kang-ho" → "Song Kang-ho" */
function articleTitle(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const raw = path.startsWith("/wiki/") ? path.slice("/wiki/".length) : null;
    return raw ? decodeURIComponent(raw).replace(/_/g, " ") : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(
    `Wikimedia → portraits: up to ${LIMIT} people${OFFSET ? ` after offset ${OFFSET}` : ""}${DRY ? " (dry run)" : ""}`,
  );

  // Most-credited first, and only people who already have an article to read: the
  // facts pass stored `wikipediaUrl`, so this needs no search step and cannot
  // attach a photograph of the wrong person with the same name.
  const people = await prisma.$queryRaw<
    { id: string; name: string; wikipediaUrl: string; credits: bigint }[]
  >`
    SELECT p.id, p.name, p."wikipediaUrl",
           (SELECT count(*) FROM "MovieCast" c WHERE c."personId" = p.id)
         + (SELECT count(*) FROM "MovieCrew" w WHERE w."personId" = p.id) AS credits
    FROM "Person" p
    WHERE p."wikipediaUrl" IS NOT NULL
      AND p.image IS NULL
    ORDER BY credits DESC, p.id
    OFFSET ${OFFSET}
    LIMIT ${LIMIT}
  `;

  if (people.length === 0) {
    console.log("Nobody with an article is missing a portrait. Nothing to do.");
    return;
  }
  console.log(`${people.length} to try. First: ${people[0].name} (${people[0].credits} credits)\n`);

  let stored = 0;
  let noFreeImage = 0;
  const failed: string[] = [];

  for (const person of people) {
    const title = articleTitle(person.wikipediaUrl);
    if (!title) {
      failed.push(`${person.name}: unreadable article URL`);
      continue;
    }

    try {
      const found = await enrich(title);
      if (!found?.image) {
        // Most people have no freely licensed photograph. That is the licence
        // working as intended, not a failure — the house monogram stands in.
        noFreeImage += 1;
      } else if (!DRY) {
        const buf = await withRetry(() => fetchRemoteImage(found.image!.url));
        const processed = await processImage(buf, { fullWidth: 640, square: true });
        const url = await putPublicObject(
          buildKey("people", processed.ext),
          processed.full.data,
          processed.contentType,
        );
        await prisma.person.update({
          where: { id: person.id },
          data: {
            image: url,
            imageCredit: found.image.credit,
            imageLicense: found.image.license,
            imageLicenseUrl: found.image.licenseUrl,
            imageSourceUrl: found.image.sourceUrl,
            // Fill-only: never displace what a person has already corrected.
            wikidataId: found.candidate.wikidataId ?? undefined,
          },
        });
        stored += 1;
        if (stored % 25 === 0) {
          console.log(`  ${stored} stored · ${noFreeImage} with no free photograph`);
        }
      } else {
        stored += 1;
      }
    } catch (e) {
      // One person's portrait is never worth the run: a 404 on Commons, an image
      // sharp cannot decode, a licence page that moved.
      failed.push(`${person.name}: ${(e as Error).message.slice(0, 120)}`);
    }

    await new Promise((r) => setTimeout(r, PACE));
  }

  const withPortraits = await prisma.person.count({ where: { image: { not: null } } });
  console.log(
    `\nStored ${stored} · no free photograph for ${noFreeImage} · failed ${failed.length}`,
  );
  console.log(`People with a portrait we own: ${withPortraits.toLocaleString("en-US")}`);
  if (failed.length > 0) {
    for (const line of failed.slice(0, 15)) console.warn(`  ${line}`);
    if (failed.length > 15) console.warn(`  …and ${failed.length - 15} more`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
