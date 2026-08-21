// The newest freely-licensed photographs of a person, from Commons, as a
// --body jobs file for fill-post-images.ts.
//
//   cd apps/web && npx tsx scripts/gather-person-photos.ts \
//     --person=kim-tae-hyung --post=<post slug> --out=jobs.json
//   npm run person-photos -- --person=… --post=… --out=…   # from the repo root
//
// Options:
//   --person=<slug>      resolve the Commons category from our Person row
//                        (wikidataId, else wikipediaUrl → Q-id) via P373
//   --category=<name>    skip resolution, use this Commons category
//   --count=N            photographs to pick (default 8)
//   --post=<slug>        the post the emitted jobs target (required with --out)
//   --embed=<video url>  prepend one `"embed": true` job for this video
//   --out=<file.json>    where to write the jobs; without it, just print
//
// **Newest first is the point.** A Commons category lists alphabetically, which
// for a person means whatever event sorts first — a 2013 fansign, forever. So
// every file's capture date (`DateTimeOriginal`, parsed by `commonsCaptureDay`)
// or upload time is read, and the pick is sorted newest-first, capped at two
// per event (files from one shoot differ by a trailing number, and eight
// near-identical frames of one red carpet is not a gallery).
//
// Only licensed files survive: no LicenseShortName, no pick — the same rule as
// every other Commons import here. The jobs carry credit, licence, licence URL
// and the file page as source, so `--body` renders the obligations with the
// picture.
import "../../../packages/db/prisma/env";
import { writeFileSync } from "node:fs";
import { prisma } from "@cinepixo/db";
import { DEFAULT_MIN_WIDTH, commonsCategoryPhotos, pickPhotos } from "@/lib/gather-sources";

function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const PERSON = strArg("person");
const CATEGORY = strArg("category");
const COUNT = Number(strArg("count")) || 8;
const POST = strArg("post");
const EMBED = strArg("embed");
const OUT = strArg("out");

const UA = "CinePixo/1.0 (https://cinepixo.com) film-criticism site";
const WD = "https://www.wikidata.org/w/api.php";
/** Category tree breadth-first, but never past grandchildren. */
const MAX_DEPTH = 2;
/** Enough files to sort; more is just more API calls. */
const MAX_FILES = 400;
/** Lower it when the alternative is no picture at all. */
const MIN_WIDTH = Number(strArg("min-width")) || DEFAULT_MIN_WIDTH;

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

interface WdEntities {
  entities?: Record<
    string,
    { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> }
  >;
}

/** The person's Commons category (P373), from whatever identity we hold. */
async function resolveCategory(): Promise<string> {
  if (CATEGORY) return CATEGORY;
  if (!PERSON) throw new Error("pass --person=<slug> or --category=<name>");

  const person = await prisma.person.findUnique({
    where: { slug: PERSON },
    select: { name: true, wikidataId: true, wikipediaUrl: true },
  });
  if (!person) throw new Error(`no person with slug ${PERSON}`);

  let qid = person.wikidataId;
  if (!qid && person.wikipediaUrl) {
    const path = new URL(person.wikipediaUrl).pathname;
    const title = path.startsWith("/wiki/") ? path.slice("/wiki/".length) : null;
    if (title) {
      const summary = await json<{ wikibase_item?: string }>(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      );
      qid = summary?.wikibase_item ?? null;
    }
  }
  if (!qid) throw new Error(`${person.name} has no Wikidata identity to resolve a category from`);

  const data = await json<WdEntities>(
    `${WD}?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`,
  );
  const category = data?.entities?.[qid]?.claims?.P373?.[0]?.mainsnak?.datavalue?.value;
  if (typeof category !== "string") {
    throw new Error(`${person.name} (${qid}) has no Commons category (P373) — pass --category=`);
  }
  return category;
}

async function main() {
  const category = await resolveCategory();
  console.log(`Commons category: ${category}`);

  // The shared walk, not a second copy of it. This file used to hand-roll the
  // category tree and the metadata batching, and the two drifted: its own
  // `eventKey` never learned the "(1)"/"(2)" frame form that the shared one
  // handles and the test suite pins, and it left the query string on every
  // rendition URL.
  const candidates = await commonsCategoryPhotos(category, MAX_DEPTH, MAX_FILES, MIN_WIDTH);
  console.log(`${candidates.length} licensed candidates at ${MIN_WIDTH}px or wider`);

  // No name gate here, deliberately. A Commons *category* is an editor's
  // assertion that these files are of this person; a text search is not. The
  // gate belongs on the search path, and applying it here threw away the best
  // pictures in the set — the premiere photographs are titled "Ari, Cynthia y
  // Jon", which contains neither of her name's tokens and is unmistakably her.
  const picked = pickPhotos(candidates, COUNT);

  console.log(`\npicked ${picked.length}, newest first:`);
  for (const c of picked) {
    // Recency and sharpness pull against each other for a living performer —
    // the crisp pictures are agency-owned and the free ones are whatever a fan
    // could upload. Both numbers are printed so the choice is an informed one.
    console.log(
      `  ${c.day}  ${String(c.width).padStart(4)}×${String(c.height).padEnd(4)}  ` +
        `${c.title} — ${c.license} — ${c.credit ?? "no credit"}`,
    );
  }
  if (picked.length === 0) {
    console.log(`  nothing at ${MIN_WIDTH}px — lower it with --min-width if a soft file will do`);
  }

  if (!OUT) return;
  if (!POST) throw new Error("--out needs --post=<post slug> to aim the jobs at");
  const jobs = [
    ...(EMBED ? [{ post: POST, youtube: EMBED, embed: true }] : []),
    ...picked.map((c) => ({
      post: POST,
      url: c.url,
      alt: c.title.replace(/_/g, " "),
      ...(c.credit ? { credit: c.credit } : {}),
      license: c.license,
      ...(c.licenseUrl ? { licenseUrl: c.licenseUrl } : {}),
      sourceUrl: c.sourceUrl,
    })),
  ];
  writeFileSync(OUT, JSON.stringify(jobs, null, 2));
  console.log(`\nwrote ${jobs.length} job(s) to ${OUT} — run: npm run post-images -- --body=${OUT}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
