// Trailers for the library, from each film's own Wikidata item — matched by QID,
// verified against YouTube before it is stored.
//
//   npm run db:import-trailers -- --limit=20000
//   npm run db:import-trailers -- --dry
//   npm run db:import-trailers -- --sources=../../deploy-jobs/movie-trailer-sources.json
//
// The details pass already reads `wdt:P1651` (a YouTube video id), but only for
// the films it happens to be filling a synopsis for, and only `SAMPLE()` — one
// id, discarded if the film was processed before. This pass asks the opposite
// question: give me *every* film on Wikidata that has a trailer id, and fill the
// ones we hold. 15,978 films carry the property against the 7,675 keys we had,
// so most of the gap is not missing data — it is data the synopsis lane has not
// reached yet and would sample away when it did.
//
// Why the match is safe: P1651 hangs off the film's own item, and we join on the
// Q-id we stored at import. There is no title search anywhere in this file, so
// the wrong film's trailer cannot land on a page — the same guarantee the poster
// pass gets from reading the film's own article.
//
// Why every key is checked against YouTube first: a dead id is worse than no
// trailer. `TrailerEmbed` renders `i.ytimg.com/vi/<key>/hqdefault.jpg` as its
// poster frame, so a removed video is a grey box on the page rather than a
// silent absence. YouTube's oEmbed endpoint answers 404/400 for anything gone,
// private or region-locked, needs no API key, and hands back the video's real
// title and channel — which is also how each row gets an honest name instead of
// the word "Trailer" repeated.
//
// What this pass will not claim: `official`. The gallery renders that as a badge,
// and a channel name is not proof of a licence — P1651 is usually the official
// trailer but "usually" is not something to print on the page. Rows land
// unofficial; promoting one is a human's call.
import "./env";
import { readFile } from "node:fs/promises";
import { prisma } from "../src/index";

const SPARQL = "https://query.wikidata.org/sparql";
const OEMBED = "https://www.youtube.com/oembed";
const USER_AGENT = "CinePixo/0.1 (https://cinepixo.com; devoh@signpost.kr) node-fetch";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const LIMIT = arg("limit", 20_000);
/** Milliseconds between oEmbed checks. No key, no published quota — stay polite. */
const PACE = arg("pace", 150);
/** Rows per SPARQL page. 5,000 answers in ~9s; larger pages start timing out. */
const PAGE = Math.min(arg("page", 5000), 10_000);
const DRY = process.argv.includes("--dry");
const SOURCES = strArg("sources");
const TARGET_QIDS = (
  process.argv.find((value) => value.startsWith("--qids="))?.slice("--qids=".length) ?? ""
)
  .split(",")
  .map((qid) => qid.trim())
  .filter((qid) => /^Q[1-9][0-9]*$/.test(qid));

/** YouTube ids are 11 characters of a known alphabet; anything else is not one. */
const youtubeKey = (v: string | undefined) => (v && /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null);

type Binding = Record<string, { value: string } | undefined>;

async function ask(query: string, attempt = 1): Promise<Binding[]> {
  const res = await fetch(SPARQL, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ query }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
      await new Promise((r) => setTimeout(r, attempt * 15_000));
      return ask(query, attempt + 1);
    }
    throw new Error(`Wikidata HTTP ${res.status}`);
  }
  const json = (await res.json()) as { results: { bindings: Binding[] } };
  return json.results.bindings;
}

/**
 * Every film item that carries a trailer id, paged.
 *
 * Ordered by ?film so OFFSET is stable across pages — without the ORDER BY the
 * endpoint is free to return the same row twice and skip another.
 */
async function allTrailerIds(): Promise<Map<string, string[]>> {
  const byQid = new Map<string, string[]>();
  for (let offset = 0; ; offset += PAGE) {
    const rows = await ask(`
SELECT ?film ?v WHERE {
  ?film wdt:P31/wdt:P279* wd:Q11424 ;
        wdt:P1651 ?v .
}
ORDER BY ?film
LIMIT ${PAGE} OFFSET ${offset}
`);
    for (const row of rows) {
      const qid = row.film?.value.split("/").pop();
      const key = youtubeKey(row.v?.value);
      if (!qid || !key) continue;
      const keys = byQid.get(qid);
      if (keys) {
        if (!keys.includes(key)) keys.push(key);
      } else {
        byQid.set(qid, [key]);
      }
    }
    console.log(`  page ${offset / PAGE + 1}: ${rows.length} rows · ${byQid.size} films so far`);
    if (rows.length < PAGE) break;
  }
  return byQid;
}

/** Trailer ids for an exact editorial batch, without scanning all of Wikidata. */
async function selectedTrailerIds(qids: string[]): Promise<Map<string, string[]>> {
  const rows = await ask(`
SELECT ?film ?v WHERE {
  VALUES ?film { ${qids.map((qid) => `wd:${qid}`).join(" ")} }
  ?film wdt:P1651 ?v .
}
ORDER BY ?film
`);
  const byQid = new Map<string, string[]>();
  for (const row of rows) {
    const qid = row.film?.value.split("/").pop();
    const key = youtubeKey(row.v?.value);
    if (!qid || !key) continue;
    const keys = byQid.get(qid) ?? [];
    if (!keys.includes(key)) keys.push(key);
    byQid.set(qid, keys);
  }
  return byQid;
}

interface Video {
  key: string;
  name: string;
  type: string;
  channel: string;
}

/**
 * The video as YouTube itself describes it — or null if it is no longer there.
 *
 * 401/403 is a video that exists but forbids embedding, which is the same thing
 * as gone for a page that can only embed it. 429 is "not yet": the same call
 * that the portrait pass learned to retry rather than lose the lookup behind it.
 */
async function describe(key: string, attempt = 1): Promise<Video | null> {
  const url = `${OEMBED}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${key}`)}&format=json`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return null;
  }
  if (res.status === 429 && attempt <= 3) {
    await new Promise((r) => setTimeout(r, attempt * 10_000));
    return describe(key, attempt + 1);
  }
  if (!res.ok) return null;

  const json = (await res.json()) as { title?: string; author_name?: string };
  const title = json.title?.trim();
  const channel = json.author_name?.trim();
  if (!title || !channel) return null;
  // P1651 is a generic YouTube-id property. A few film items also carry long
  // previews or deleted-scene compilations; those are not trailers and should
  // not be promoted into the film page's primary player.
  if (/deleted scenes?|extended preview/i.test(title)) return null;
  return { key, name: title.slice(0, 200), type: kind(title), channel };
}

/**
 * What the video calls itself. The gallery's picker is labelled by `type`, so
 * three entries reading "Trailer 1/2/3" is worse than "Trailer", "Teaser",
 * "Featurette" when the titles say so.
 */
function kind(title: string): string {
  if (/teaser/i.test(title)) return "Teaser";
  if (/featurette|behind the scenes|making of/i.test(title)) return "Featurette";
  if (/\bclip\b|\bscene\b/i.test(title)) return "Clip";
  return "Trailer";
}

interface SourceJob {
  slug: string;
  wikidataId?: string;
  imdbId?: string;
  youtubeKey: string;
  channel: string;
}

/** Human-researched official trailers, still guarded by our film identities. */
async function importSourcedTrailers(path: string): Promise<void> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("Trailer sources file must contain a JSON array.");
  const jobs = raw as SourceJob[];
  let filled = 0;
  let skipped = 0;

  for (const job of jobs) {
    const key = youtubeKey(job.youtubeKey);
    if (!job?.slug || !key || !job.channel || (!job.wikidataId && !job.imdbId)) {
      throw new Error(`Invalid trailer source job: ${job?.slug ?? "unknown"}`);
    }
    const movie = await prisma.movie.findUnique({
      where: { slug: job.slug },
      select: {
        id: true,
        title: true,
        wikidataId: true,
        imdbId: true,
        trailerKey: true,
        trailerFile: true,
      },
    });
    if (!movie) throw new Error(`Movie not found: ${job.slug}`);
    if (movie.wikidataId && job.wikidataId && movie.wikidataId !== job.wikidataId) {
      throw new Error(`Wikidata identity mismatch for ${job.slug}`);
    }
    if (movie.imdbId && job.imdbId && movie.imdbId !== job.imdbId) {
      throw new Error(`IMDb identity mismatch for ${job.slug}`);
    }
    if (movie.trailerKey || movie.trailerFile) {
      console.log(`skip: ${movie.title} already has a trailer`);
      skipped += 1;
      continue;
    }

    const video = await describe(key);
    if (!video) throw new Error(`Trailer is not playable: ${job.slug} / ${key}`);
    if (video.channel !== job.channel) {
      throw new Error(`Channel mismatch for ${job.slug}: expected ${job.channel}, got ${video.channel}`);
    }
    if (video.type !== "Trailer" && video.type !== "Teaser") {
      throw new Error(`Sourced video is not a trailer: ${job.slug} / ${video.name}`);
    }
    if (DRY) {
      console.log(`would fill ${movie.title}: ${video.name} — ${video.channel}`);
      filled += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.movie.update({
        where: { id: movie.id },
        data: {
          trailerKey: video.key,
          wikidataId: movie.wikidataId ?? job.wikidataId,
          imdbId: movie.imdbId ?? job.imdbId,
        },
      });
      await tx.movieVideo.upsert({
        where: { movieId_youtubeKey: { movieId: movie.id, youtubeKey: video.key } },
        update: { name: video.name, type: video.type, official: true },
        create: {
          movieId: movie.id,
          youtubeKey: video.key,
          name: video.name,
          type: video.type,
          official: true,
          sort: 0,
        },
      });
    });
    console.log(`filled ${movie.title}: ${video.name} — ${video.channel}`);
    filled += 1;
    await new Promise((resolve) => setTimeout(resolve, PACE));
  }
  console.log(`Filled ${filled} sourced trailer(s); skipped ${skipped}.`);
}

async function main() {
  if (SOURCES) {
    await importSourcedTrailers(SOURCES);
    return;
  }
  console.log(`Wikidata → trailers: up to ${LIMIT} films${DRY ? " (dry run)" : ""}`);

  console.log(TARGET_QIDS.length > 0 ? "Reading the selected films' trailer ids…" : "Reading every film with a trailer id…");
  const byQid = TARGET_QIDS.length > 0
    ? await selectedTrailerIds(TARGET_QIDS)
    : await allTrailerIds();
  console.log(`${byQid.size.toLocaleString("en-US")} films on Wikidata carry a trailer id.\n`);

  // Only films we hold, and only those still without a key — fill-only, like
  // every other pass here. `IN` over ~16k ids is well inside what PG takes.
  const qids = [...byQid.keys()];

  // Printed every run, because "nothing to do" has two very different causes:
  // the library already holds every trailer Wikidata offers, or the library and
  // the property barely overlap. Only the second one is worth acting on.
  const held = await prisma.movie.count({ where: { wikidataId: { in: qids } } });
  console.log(
    `We hold ${held.toLocaleString("en-US")} of them; ` +
      `${(byQid.size - held).toLocaleString("en-US")} are films this library never imported.`,
  );

  const films = await prisma.movie.findMany({
    where: { wikidataId: { in: qids }, trailerKey: null },
    orderBy: [{ wikidataSitelinks: "desc" }, { releaseDate: "desc" }],
    take: LIMIT,
    select: { id: true, slug: true, title: true, wikidataId: true },
  });

  if (films.length === 0) {
    console.log("Every film we hold with a Wikidata trailer already has one. Nothing to do.");
    return;
  }
  console.log(`${films.length.toLocaleString("en-US")} to fill. First: ${films[0].title}\n`);

  let filled = 0;
  let galleries = 0;
  let dead = 0;
  const failed: string[] = [];

  for (const film of films) {
    const keys = byQid.get(film.wikidataId!) ?? [];
    const live: Video[] = [];

    for (const key of keys) {
      const video = await describe(key);
      if (video) live.push(video);
      else dead += 1;
      await new Promise((r) => setTimeout(r, PACE));
    }

    if (live.length === 0) continue;

    if (DRY) {
      console.log(`would fill ${film.slug}: ${live.map((v) => `${v.type} “${v.name}”`).join(" · ")}`);
      filled += 1;
      continue;
    }

    try {
      await prisma.movie.update({
        where: { id: film.id },
        data: { trailerKey: live[0].key },
      });
      filled += 1;

      // One trailer reads best as the page's single `TrailerEmbed`; the gallery
      // only earns its picker when there is something to pick between. When it
      // does appear it replaces the embed, so *every* key goes in — a gallery
      // missing the primary trailer would be a regression.
      if (live.length > 1) {
        for (const [sort, video] of live.entries()) {
          await prisma.movieVideo.upsert({
            where: { movieId_youtubeKey: { movieId: film.id, youtubeKey: video.key } },
            update: {},
            create: {
              movieId: film.id,
              youtubeKey: video.key,
              name: video.name,
              type: video.type,
              official: false,
              sort,
            },
          });
        }
        galleries += 1;
      }

      if (filled % 25 === 0) {
        console.log(`  ${filled} filled · ${galleries} with a gallery · ${dead} dead ids`);
      }
    } catch (e) {
      failed.push(`${film.title}: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  const total = await prisma.movie.count({ where: { trailerKey: { not: null } } });
  console.log(
    `\nFilled ${filled} · ${galleries} galleries · ${dead} ids no longer playable · failed ${failed.length}`,
  );
  console.log(`Films with a trailer: ${total.toLocaleString("en-US")}`);
  for (const line of failed.slice(0, 12)) console.warn(`  ${line}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
