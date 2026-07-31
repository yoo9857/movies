// The whole film, when the film is free — from Commons onto our storage.
//
//   npm run free-films -w web -- --dry --limit=20
//   npm run free-films -w web -- --limit=50 --budget-mb=4000
//
// Wikidata's P10 points at a video of the work itself, and on a film item that
// video is the film: 4,397 films carry one, 1,997 of them are in this library —
// public-domain shorts, the silent canon, wartime documentary. A site about
// watching films that can *play* two thousand of them is worth more than the
// trailer it could not get, and it costs nothing but bandwidth because the
// material is genuinely free.
//
// Three things this pass is careful about:
//
//  · **Size.** The Commons original is an archival master: a five-minute 1929
//    cartoon is 499 MB. Wikimedia also publishes VP9 transcodes of everything,
//    and the 480p is 37 MB — 7% of the master for a size no one watching in a
//    page will notice. We take a transcode, never the original, and refuse any
//    file over `--max-mb` so one four-gigabyte outlier cannot eat a run.
//
//  · **Disk.** `putPublicObject` falls back to the local driver when S3 is not
//    configured, which is how this deploy runs today — so an unbounded pass
//    writes tens of gigabytes onto the server's root filesystem, next to ten
//    other sites. `--budget-mb` is a hard ceiling per run and the default is
//    deliberately small. Raise it when the bucket is configured, not before.
//
//  · **Provenance.** Public domain is still a licence, and the CHECK refuses a
//    licence without its source. The Commons file page, the uploader's credit
//    line and the licence name travel with the file and render under the
//    player — the same contract the portraits and posters signed.
import "../../../packages/db/prisma/env";
import { prisma } from "@cinepixo/db";
import { buildKey, putPublicObject, usingObjectStorage } from "@/lib/media/storage";

const SPARQL = "https://query.wikidata.org/sparql";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
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

const LIMIT = arg("limit", 25);
/** Largest single file we will take, megabytes. A 480p feature runs ~150 MB. */
const MAX_MB = arg("max-mb", 200);
/**
 * Total megabytes this run may write. The whole set is ~90 GB at 480p and the
 * server has 68 GB free on a disk it shares with everything else, so the
 * default is a rounding error by comparison and has to be raised on purpose.
 */
const BUDGET_MB = arg("budget-mb", 2000);
/** Milliseconds between films. These are big files; do not hammer Commons. */
const PACE = arg("pace", 2000);
const FILM = strArg("film");
const DRY = process.argv.includes("--dry");
/**
 * Take only one side of P10. Worth a flag because the two cost wildly different
 * amounts: a public-domain trailer is ~20 MB at 480p and a feature is 130–160 MB
 * even at 240p, so on a deploy writing to the server's own disk the trailers are
 * nearly free and the features are the entire budget.
 */
const TRAILERS_ONLY = process.argv.includes("--trailers-only");
const FILMS_ONLY = process.argv.includes("--films-only");

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

/** Every film item with a video of itself → the Commons file name. */
async function allFreeFilms(): Promise<Map<string, string>> {
  const byQid = new Map<string, string>();
  const rows = await ask(`
SELECT ?film ?v WHERE {
  ?film wdt:P31/wdt:P279* wd:Q11424 ;
        wdt:P10 ?v .
}
ORDER BY ?film
`);
  for (const row of rows) {
    const qid = row.film?.value.split("/").pop();
    const src = row.v?.value;
    if (!qid || !src || byQid.has(qid)) continue;
    // "…/Special:FilePath/The%20Skeleton%20Dance%20(1929).webm" → the file name.
    const marker = "Special:FilePath/";
    const at = src.indexOf(marker);
    if (at === -1) continue;
    byQid.set(qid, decodeURIComponent(src.slice(at + marker.length)));
  }
  return byQid;
}

interface Playable {
  url: string;
  bytes: number;
  contentType: string;
  label: string;
  duration: number | null;
  credit: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string;
}

/**
 * P10 holds the film *or* its trailer, and the difference is not decorative:
 * one is "Watch the film", the other is the trailer this library could not get
 * a YouTube key for. Calling a two-minute reel "the complete film" would be a
 * lie printed on the page.
 *
 * Runtime decides it. `Movie.runtime` is minutes and 80,753 films have one, so
 * a video running less than half the picture is a trailer — Some Like It Hot is
 * 120 minutes and its P10 video is 140 seconds. The file name is the fallback
 * for the films with no runtime stored, and it agrees on every case checked:
 * "Some Like it Hot (1959) trailer.webm" against "A Bucket of Blood (1959) by
 * Roger Corman 2.webm", which runs the full 65 minutes.
 *
 * Unknowable — no runtime, no telling name — is treated as the film, because
 * that is what 95% of P10 videos are.
 */
function isTrailer(fileName: string, duration: number | null, runtimeMinutes: number | null) {
  if (runtimeMinutes && duration) return duration < runtimeMinutes * 60 * 0.5;
  return /trailer|teaser/i.test(fileName);
}

/** Commons markup arrives as HTML in a JSON string; the page renders text. */
function plain(value: string | undefined): string | null {
  if (!value) return null;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 300) : null;
}

/**
 * The smallest transcode that is still worth watching, with its terms.
 *
 * Preference order is 480p, then 240p — never the original, which is an
 * archival master an order of magnitude larger for a difference invisible in a
 * 16:9 box on a film page. A file whose only form is the master is skipped
 * rather than downloaded: `HEAD` decides that, so nothing large is fetched to
 * find out it was too large.
 */
interface Described {
  duration: number | null;
  derivatives: { src?: string; type?: string; transcodekey?: string }[];
  meta: Record<string, { value?: string } | undefined>;
  sourceUrl: string;
}

/**
 * What Commons knows about the file, before a single byte of video is touched.
 *
 * Split from the size check on purpose: duration is what says "trailer or
 * picture", and asking that first means a `--trailers-only` sweep never issues
 * a CDN request for the 95% of P10 videos that are features.
 */
async function describe(fileName: string): Promise<Described | null> {
  const url = new URL(COMMONS);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", `File:${fileName}`);
  url.searchParams.set("prop", "videoinfo");
  url.searchParams.set("viprop", "derivatives|size|url|extmetadata");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    query?: {
      pages?: {
        videoinfo?: {
          duration?: number;
          descriptionurl?: string;
          extmetadata?: Record<string, { value?: string } | undefined>;
          derivatives?: { src?: string; type?: string; transcodekey?: string }[];
        }[];
      }[];
    };
  };
  const info = json.query?.pages?.[0]?.videoinfo?.[0];
  if (!info?.derivatives) return null;

  return {
    duration: info.duration ? Math.round(info.duration) : null,
    derivatives: info.derivatives,
    meta: info.extmetadata ?? {},
    sourceUrl:
      info.descriptionurl ??
      `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`,
  };
}

/** The smallest transcode worth watching that also fits `--max-mb`. */
async function playable(info: Described): Promise<Playable | null> {
  const wanted = ["480p.vp9.webm", "240p.vp9.webm"];
  let chosen: { src: string; type: string; label: string; bytes: number } | null = null;
  for (const key of wanted) {
    const hit = info.derivatives.find((d) => d.transcodekey === key);
    if (!hit?.src) continue;
    // The API does not carry transcode sizes; the CDN does.
    const head = await fetch(hit.src, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!head.ok) continue;
    const bytes = Number(head.headers.get("content-length") ?? 0);
    if (!bytes || bytes > MAX_MB * 1_000_000) continue;
    chosen = { src: hit.src, type: hit.type?.split(";")[0] ?? "video/webm", label: key, bytes };
    break;
  }
  if (!chosen) return null;

  const meta = info.meta;
  return {
    url: chosen.src,
    bytes: chosen.bytes,
    contentType: chosen.type,
    label: chosen.label,
    duration: info.duration,
    credit: plain(meta.Artist?.value) ?? plain(meta.Credit?.value),
    license: plain(meta.LicenseShortName?.value) ?? plain(meta.UsageTerms?.value),
    licenseUrl: plain(meta.LicenseUrl?.value),
    sourceUrl: info.sourceUrl,
  };
}

const mb = (bytes: number) => (bytes / 1_000_000).toFixed(0);

/**
 * Fetch the video, retrying the one status worth retrying.
 *
 * upload.wikimedia.org throttles bulk media pulls, and a 429 means "not yet",
 * not "no" — the first sweep lost Robot Monster to one. The pause widens the
 * way the portrait pass learned to: anything else (a 404, a moved file) fails
 * immediately, because a second attempt fails identically.
 */
async function download(url: string, attempt = 1): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(600_000),
  });
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  if (res.status === 429 && attempt <= 3) {
    await new Promise((r) => setTimeout(r, attempt * 20_000));
    return download(url, attempt + 1);
  }
  throw new Error(`download HTTP ${res.status}`);
}

async function main() {
  console.log(`Commons → free films: up to ${FILM ?? LIMIT}${DRY ? " (dry run)" : ""}`);
  console.log(
    `Storage: ${usingObjectStorage ? "object storage" : "LOCAL DISK (no S3 configured)"} · ` +
      `budget ${BUDGET_MB} MB · max ${MAX_MB} MB per film\n`,
  );

  const byQid = await allFreeFilms();
  console.log(`${byQid.size.toLocaleString("en-US")} films on Wikidata carry a video of themselves.`);

  const films = await prisma.movie.findMany({
    where: FILM
      ? { slug: FILM }
      : {
          wikidataId: { in: [...byQid.keys()] },
          // Either slot still empty — which of the two a film needs is not
          // known until Commons has been asked how long the video runs.
          OR: [{ filmFile: null }, { trailerFile: null }],
        },
    orderBy: [{ wikidataSitelinks: "desc" }, { releaseDate: "desc" }],
    take: FILM ? 1 : LIMIT,
    select: {
      id: true,
      slug: true,
      title: true,
      wikidataId: true,
      runtime: true,
      filmFile: true,
      trailerFile: true,
    },
  });

  if (films.length === 0) {
    console.log("No film we hold has a free video we have not already stored. Nothing to do.");
    return;
  }
  console.log(`${films.length} to try. First: ${films[0].title}\n`);

  let stored = 0;
  let trailers = 0;
  let spentBytes = 0;
  let tooBig = 0;
  const failed: string[] = [];

  for (const film of films) {
    const fileName = byQid.get(film.wikidataId!);
    if (!fileName) continue;

    try {
      const info = await describe(fileName);
      if (!info) continue;

      // Decide what this is before asking what it weighs.
      const trailer = isTrailer(fileName, info.duration, film.runtime);
      if (trailer ? FILMS_ONLY : TRAILERS_ONLY) continue;
      // Fill-only, per slot: a film whose trailer we already hold must not be
      // re-fetched because its *film* slot happens to be empty.
      if (trailer ? film.trailerFile : film.filmFile) continue;

      const pick = await playable(info);
      if (!pick) {
        tooBig += 1;
        continue;
      }

      if (spentBytes + pick.bytes > BUDGET_MB * 1_000_000) {
        console.log(
          `\nBudget reached at ${mb(spentBytes)} MB — stopping before ${film.title} (${mb(pick.bytes)} MB).`,
        );
        break;
      }

      if (DRY) {
        console.log(
          `would store ${film.slug} as ${trailer ? "TRAILER" : "FILM   "}: ` +
            `${pick.label} ${mb(pick.bytes)} MB · ${pick.duration ?? "?"}s ` +
            `(runtime ${film.runtime ?? "?"}m) · ${pick.license ?? "no licence stated"}`,
        );
        stored += 1;
        if (trailer) trailers += 1;
        spentBytes += pick.bytes;
        continue;
      }

      const body = await download(pick.url);

      const url = await putPublicObject(
        buildKey(trailer ? "trailers" : "films-full", "webm"),
        body,
        pick.contentType,
      );
      await prisma.movie.update({
        where: { id: film.id },
        data: trailer
          ? {
              trailerFile: url,
              trailerFileCredit: pick.credit,
              trailerFileLicense: pick.license,
              trailerFileLicenseUrl: pick.licenseUrl,
              trailerFileSourceUrl: pick.sourceUrl,
              trailerFileDuration: pick.duration,
            }
          : {
              filmFile: url,
              filmFileCredit: pick.credit,
              filmFileLicense: pick.license,
              filmFileLicenseUrl: pick.licenseUrl,
              filmFileSourceUrl: pick.sourceUrl,
              filmFileDuration: pick.duration,
            },
      });

      stored += 1;
      if (trailer) trailers += 1;
      spentBytes += pick.bytes;
      console.log(
        `  ${trailer ? "trailer" : "film   "}  ${film.title} — ${pick.label} ` +
          `${mb(pick.bytes)} MB (${mb(spentBytes)}/${BUDGET_MB} MB used)`,
      );
    } catch (e) {
      failed.push(`${film.title}: ${(e as Error).message.slice(0, 120)}`);
    }

    await new Promise((r) => setTimeout(r, PACE));
  }

  const total = await prisma.movie.count({ where: { filmFile: { not: null } } });
  const withTrailer = await prisma.movie.count({ where: { trailerFile: { not: null } } });
  console.log(
    `\nStored ${stored} (${stored - trailers} films, ${trailers} trailers) · ${mb(spentBytes)} MB · ` +
      `${tooBig} had no transcode under ${MAX_MB} MB · failed ${failed.length}`,
  );
  console.log(
    `Films we can play in full: ${total.toLocaleString("en-US")} · ` +
      `trailers on our own storage: ${withTrailer.toLocaleString("en-US")}`,
  );
  for (const line of failed.slice(0, 12)) console.warn(`  ${line}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
