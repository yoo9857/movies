// Real film artwork, found on Wikimedia Commons, stored on our own origin.
//
//   npm run artwork -w web -- --limit=500
//
// Not a generated card: an actual poster or still for the film, where one exists
// under a licence that allows it. Wikidata records two claims worth asking for —
// P3383 (film poster) first, then P18 (image) — and both point at Commons files
// whose licence and author Commons will state.
//
// Measured before writing this, over the 188,486 films the bulk import covers:
// 2,467 have a poster claim and 11,909 have an image claim. That is the ceiling,
// and it is worth being exact about why, because it looks like a bug and is not:
// a theatrical poster is copyrighted. The posters on Wikipedia are non-free files
// uploaded with a fair-use rationale for one article, which does not travel to
// another site — so they are not ours to re-host or hotlink, and nothing here
// tries. Films with no free artwork keep the house card.
//
// What is stored travels with its terms: the file on our storage, the author, the
// licence, the licence URL, the Commons page. A CHECK constraint refuses a row
// with a file and no source.
import "../../../packages/db/prisma/env";
import { prisma } from "@cinepixo/db";
import { fetchRemoteImage, processImage } from "@/lib/media/image";
import { buildKey, putPublicObject } from "@/lib/media/storage";
import { commonsImage } from "@/lib/wikimedia";

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "CinePixo/0.1 (https://cinepixo.com; devoh@signpost.kr) node-fetch";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

const LIMIT = arg("limit", 200);
const BATCH = Math.min(arg("batch", 50), 120);
/** upload.wikimedia.org throttles image fetches harder than the APIs do. */
const PACE = arg("pace", 1200);
const DRY = process.argv.includes("--dry");

type Binding = Record<string, { value: string } | undefined>;

/**
 * The file name of a film's free artwork, poster claim preferred.
 *
 * Both properties are asked for in one query per batch; P3383 is the poster and
 * P18 is whatever image the item leads with, which for a film is usually a still
 * or a frame. Either is a real picture of the film — a generated card is not.
 */
function query(qids: string[]): string {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  return `
SELECT ?film (SAMPLE(?poster) AS ?posterFile) (SAMPLE(?image) AS ?imageFile) WHERE {
  VALUES ?film { ${values} }
  OPTIONAL { ?film wdt:P3383 ?poster }
  OPTIONAL { ?film wdt:P18 ?image }
}
GROUP BY ?film
`;
}

async function ask(sparql: string, attempt = 1): Promise<Binding[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ query: sparql }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
      await new Promise((r) => setTimeout(r, attempt * 15_000));
      return ask(sparql, attempt + 1);
    }
    throw new Error(`Wikidata HTTP ${res.status}`);
  }
  const json = (await res.json()) as { results: { bindings: Binding[] } };
  return json.results.bindings;
}

/** Three tries for a throttled fetch; immediate failure for anything else. */
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

/** A Commons URL ends in the file name; the API wants the name alone. */
const fileNameOf = (value: string) => decodeURIComponent(value.split("/").pop() ?? "");

async function main() {
  console.log(`Commons → film artwork: up to ${LIMIT} films${DRY ? " (dry run)" : ""}`);

  // Most-documented first, and only films that have neither our own artwork nor a
  // TMDB path already: this fills gaps, it does not replace curation.
  const films = await prisma.$queryRaw<{ id: string; wikidataId: string; title: string }[]>`
    SELECT id, "wikidataId", title
    FROM "Movie"
    WHERE "wikidataId" IS NOT NULL
      AND image IS NULL
      AND "posterPath" IS NULL
    ORDER BY "wikidataSitelinks" DESC NULLS LAST, "releaseDate" DESC NULLS LAST
    LIMIT ${LIMIT}
  `;

  if (films.length === 0) {
    console.log("Every film with a QID already has artwork. Nothing to do.");
    return;
  }
  console.log(`${films.length} films to try. First: ${films[0].title}\n`);

  let stored = 0;
  let noFreeArtwork = 0;
  const failed: string[] = [];

  for (let i = 0; i < films.length; i += BATCH) {
    const batch = films.slice(i, i + BATCH);
    const byQid = new Map(batch.map((f) => [f.wikidataId, f]));

    let rows: Binding[];
    try {
      rows = await ask(query(batch.map((f) => f.wikidataId)));
    } catch (e) {
      console.warn(`!  batch ${i / BATCH + 1}: ${(e as Error).message}`);
      continue;
    }

    for (const b of rows) {
      const qid = b.film?.value.split("/").pop();
      const film = qid ? byQid.get(qid) : undefined;
      if (!film) continue;

      const fileUrl = b.posterFile?.value ?? b.imageFile?.value;
      if (!fileUrl) {
        noFreeArtwork += 1;
        continue;
      }

      try {
        const commons = await commonsImage(fileNameOf(fileUrl));
        if (!commons?.url) {
          noFreeArtwork += 1;
          continue;
        }
        if (DRY) {
          console.log(`   ${film.title} → ${commons.license ?? "licence unstated"}`);
          stored += 1;
          continue;
        }

        const buf = await withRetry(() => fetchRemoteImage(commons.url));
        // Poster-shaped, so no square crop: a poster cropped to a square is a
        // different picture. 780 is the widest size any page asks for.
        const processed = await processImage(buf, { fullWidth: 780 });
        const url = await putPublicObject(
          buildKey("films", processed.ext),
          processed.full.data,
          processed.contentType,
        );
        await prisma.movie.update({
          where: { id: film.id },
          data: {
            image: url,
            imageCredit: commons.credit,
            imageLicense: commons.license,
            imageLicenseUrl: commons.licenseUrl,
            imageSourceUrl: commons.sourceUrl,
          },
        });
        stored += 1;
        if (stored % 20 === 0) console.log(`  ${stored} stored · ${noFreeArtwork} with none free`);
      } catch (e) {
        failed.push(`${film.title}: ${(e as Error).message.slice(0, 120)}`);
      }

      await new Promise((r) => setTimeout(r, PACE));
    }
  }

  const withArtwork = await prisma.movie.count({ where: { image: { not: null } } });
  console.log(
    `\nStored ${stored} · no free artwork for ${noFreeArtwork} · failed ${failed.length}`,
  );
  console.log(`Films with artwork we host: ${withArtwork.toLocaleString("en-US")}`);
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
