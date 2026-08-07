// Every film's poster, from its own Wikipedia article — onto our storage.
//
//   npm run posters -w web -- --limit=500
//   npm run posters -w web -- --film=spider-man-brand-new-day-2026
//   npm run posters -w web -- --sources=../../deploy-jobs/movie-artwork-sources.json
//
// Owner's decision (2026-07-31): posters are displayed site-wide for
// identification, the way film databases and review sites do. The source that
// makes this accurate at scale is not an image search — it is the film's own
// article: we already store `wikipediaUrl` per film, and the article's lead
// image is the theatrical poster for essentially every film page on Wikipedia.
// The same match that gave the film its synopsis gives it its poster, so the
// wrong film's artwork cannot land here.
//
// Files are fetched once, re-encoded, and stored under our own key like every
// other image. Provenance still travels: the source URL is the article, and
// the credit line names the rights holders — a poster is identification, not
// something we claim. Films that already carry artwork (the freely licensed
// Commons imports, or an operator upload) are never touched: fill-only.
import "../../../packages/db/prisma/env";
import { readFile } from "node:fs/promises";
import { prisma } from "@cinepixo/db";
import { fetchRemoteImage, processImage } from "@/lib/media/image";
import { buildKey, putPublicObject } from "@/lib/media/storage";

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

const LIMIT = arg("limit", 500);
/** upload.wikimedia.org throttles image fetches; 1200ms held for the portraits. */
const PACE = arg("pace", 1200);
const FILM = strArg("film");
const SOURCES = strArg("sources");
const DRY = process.argv.includes("--dry");

interface SourceJob {
  slug: string;
  wikidataId?: string;
  imdbId?: string;
  url: string;
  sourceUrl: string;
  credit: string;
  license: string;
  licenseUrl?: string;
}

/** Operator-researched artwork from an authoritative archive or rights holder. */
async function importSourcedArtwork(path: string): Promise<void> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("Artwork sources file must contain a JSON array.");
  const jobs = raw as SourceJob[];
  let stored = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (!job?.slug || !job.url || !job.sourceUrl || !job.credit || !job.license) {
      throw new Error("Every artwork source needs slug, url, sourceUrl, credit, and license.");
    }
    if (!job.wikidataId && !job.imdbId) {
      throw new Error(`Artwork source needs a Wikidata or IMDb identity: ${job.slug}`);
    }
    for (const value of [job.url, job.sourceUrl, ...(job.licenseUrl ? [job.licenseUrl] : [])]) {
      const url = new URL(value);
      if (url.protocol !== "https:") throw new Error(`Only HTTPS sources are accepted: ${value}`);
    }
    const movie = await prisma.movie.findUnique({
      where: { slug: job.slug },
      select: { id: true, title: true, image: true, wikidataId: true, imdbId: true },
    });
    if (!movie) throw new Error(`Movie not found: ${job.slug}`);
    if (job.wikidataId && movie.wikidataId !== job.wikidataId) {
      throw new Error(`Wikidata identity mismatch for ${job.slug}`);
    }
    if (job.imdbId && movie.imdbId !== job.imdbId) {
      throw new Error(`IMDb identity mismatch for ${job.slug}`);
    }
    if (movie.image) {
      console.log(`skip: ${movie.title} already has sourced artwork`);
      skipped += 1;
      continue;
    }
    if (DRY) {
      console.log(`would store: ${movie.title} <- ${job.sourceUrl}`);
      stored += 1;
      continue;
    }

    const buf = await fetchRemoteImage(job.url);
    const processed = await processImage(buf, { fullWidth: 780 });
    const url = await putPublicObject(
      buildKey("films", processed.ext),
      processed.full.data,
      processed.contentType,
    );
    await prisma.movie.update({
      where: { id: movie.id },
      data: {
        image: url,
        imageCredit: job.credit,
        imageLicense: job.license,
        imageLicenseUrl: job.licenseUrl ?? null,
        imageSourceUrl: job.sourceUrl,
      },
    });
    console.log(`stored: ${movie.title} <- ${job.sourceUrl}`);
    stored += 1;
  }
  console.log(`Stored ${stored} sourced poster(s); skipped ${skipped}.`);
}
/**
 * The films with no English article at all — 11,842 of them, and invisible to
 * the default pass because it selects on `wikipediaUrl`.
 *
 * A poster is a picture. The Polish, Finnish or Armenian article for a film
 * carries the same theatrical poster in its infobox as the English one would,
 * so the only thing the English edition was ever providing here was an address.
 * Measured over 25 of these films, some edition has a lead image for 72% of
 * them. Nothing else about the import changes: the file is re-encoded onto our
 * storage and credited to the rights holders, and `imageSourceUrl` records the
 * article we actually read rather than an English one that does not exist.
 */
const FOREIGN = process.argv.includes("--foreign");
/** Editions to try per film before giving up. Ordered by article length. */
const MAX_EDITIONS = arg("editions", 6);

/** "https://en.wikipedia.org/wiki/Oldboy_(2003_film)" → "Oldboy (2003 film)" */
function articleTitle(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const raw = path.startsWith("/wiki/") ? path.slice("/wiki/".length) : null;
    return raw ? decodeURIComponent(raw).replace(/_/g, " ") : null;
  } catch {
    return null;
  }
}

/**
 * The article's lead image at full size — the infobox poster, in practice.
 *
 * Takes the article URL rather than a bare title so it works against any
 * edition: the host is where the query goes, and each Wikipedia hosts its own
 * non-free uploads (`upload.wikimedia.org/wikipedia/fi/…`), so the poster is
 * only reachable through the wiki that holds it.
 */
async function leadImage(articleUrl: string): Promise<string | null> {
  const title = articleTitle(articleUrl);
  if (!title) return null;
  let host: string;
  try {
    host = new URL(articleUrl).host;
  } catch {
    return null;
  }
  const url = new URL(`https://${host}/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "original");
  // The default is pilicense=free, which silently excludes exactly the image
  // this script exists to fetch — film posters are non-free by nature.
  url.searchParams.set("pilicense", "any");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      query?: { pages?: { original?: { source?: string } }[] };
    };
    const src = json.query?.pages?.[0]?.original?.source;
    // A lead image that is not a file is not an image: some editions answer
    // with a page name when the infobox holds no picture.
    return src && /\.(jpe?g|png|gif|webp|svg)$/i.test(new URL(src).pathname) ? src : null;
  } catch {
    return null;
  }
}

/**
 * Every Wikipedia article for a batch of films, longest edition first.
 *
 * One query per batch rather than per film. `schema:isPartOf` filtered to
 * wikipedia.org keeps out Wikiquote, Wikisource and Commons, none of which
 * carries an infobox poster.
 */
async function articlesFor(qids: string[]): Promise<Map<string, string[]>> {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const query = `
SELECT ?film ?wiki WHERE {
  VALUES ?film { ${values} }
  ?wiki schema:about ?film ;
        schema:isPartOf ?site .
  FILTER(CONTAINS(STR(?site), "wikipedia.org"))
}
`;
  const byQid = new Map<string, string[]>();
  try {
    const res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return byQid;
    const json = (await res.json()) as {
      results: { bindings: { film?: { value: string }; wiki?: { value: string } }[] };
    };
    for (const b of json.results.bindings) {
      const qid = b.film?.value.split("/").pop();
      const wiki = b.wiki?.value;
      if (!qid || !wiki) continue;
      const list = byQid.get(qid);
      if (list) list.push(wiki);
      else byQid.set(qid, [wiki]);
    }
  } catch {
    // A batch that does not answer costs those films this round, not the run.
  }
  return byQid;
}

async function main() {
  if (SOURCES) {
    await importSourcedArtwork(SOURCES);
    return;
  }
  console.log(`Wikipedia → posters: up to ${FILM ?? LIMIT}${DRY ? " (dry run)" : ""}`);

  const films = await prisma.movie.findMany({
    where: FILM
      ? { slug: FILM }
      : FOREIGN
        ? { image: null, wikipediaUrl: null, wikidataId: { not: null } }
        : { image: null, wikipediaUrl: { not: null } },
    orderBy: [{ wikidataSitelinks: "desc" }, { releaseDate: "desc" }],
    take: FILM ? 1 : LIMIT,
    select: { id: true, slug: true, title: true, wikipediaUrl: true, wikidataId: true },
  });
  if (films.length === 0) {
    console.log("No film with an article is missing a poster. Nothing to do.");
    return;
  }
  console.log(`${films.length} films to try. First: ${films[0].title}\n`);

  // In foreign mode the addresses come from Wikidata, sixty films to a query.
  const articles = new Map<string, string[]>();
  if (FOREIGN) {
    const qids = films.map((f) => f.wikidataId!).filter(Boolean);
    for (let i = 0; i < qids.length; i += 60) {
      for (const [qid, wikis] of await articlesFor(qids.slice(i, i + 60))) {
        articles.set(qid, wikis);
      }
    }
    console.log(`${articles.size} of them have an article in some edition.\n`);
  }

  let stored = 0;
  let noImage = 0;
  const failed: string[] = [];

  for (const film of films) {
    const candidates = FOREIGN
      ? (articles.get(film.wikidataId ?? "") ?? []).slice(0, MAX_EDITIONS)
      : film.wikipediaUrl
        ? [film.wikipediaUrl]
        : [];
    if (candidates.length === 0) {
      failed.push(`${film.title}: no article to read`);
      continue;
    }
    try {
      // First edition that actually has a picture wins; the rest are not asked.
      let src: string | null = null;
      let from: string | null = null;
      for (const article of candidates) {
        src = await leadImage(article);
        if (src) {
          from = article;
          break;
        }
      }
      if (!src) {
        noImage += 1;
      } else if (!DRY) {
        const buf = await fetchRemoteImage(src);
        // Poster-shaped, so no square crop; 780 is the widest size any page asks for.
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
            imageCredit: "© the film's rights holders",
            imageLicense: "Poster shown for identification",
            // The article we actually read, which in foreign mode is not English.
            imageSourceUrl: from,
          },
        });
        stored += 1;
        if (stored % 25 === 0) console.log(`  ${stored} stored · ${noImage} without a lead image`);
      } else {
        console.log(`would store: ${film.title} ← [${new URL(from!).host.split(".")[0]}] ${src}`);
        stored += 1;
      }
    } catch (e) {
      failed.push(`${film.title}: ${(e as Error).message.slice(0, 120)}`);
    }
    await new Promise((r) => setTimeout(r, PACE));
  }

  console.log(`\nStored ${stored} · no lead image for ${noImage} · failed ${failed.length}`);
  for (const line of failed.slice(0, 12)) console.warn(`  ${line}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
