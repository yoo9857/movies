// Real posters for the library, from TMDB, matched by IMDb id.
//
//   npm run db:import-tmdb-posters -- --limit=120000
//
// The Wikidata import filled 115,000 rows of facts and no artwork, because a
// theatrical poster is copyrighted and Commons carries a free one for barely 1%
// of films. TMDB is the source that *can* serve the rest: `posterPath` is their
// path, their CDN completes it (see Poster.tsx), and the site-wide TMDB notice
// covers the usage — exactly how the seeded films already show theirs.
//
// Matching is by IMDb id, never by title: every film the bulk import accepted
// carried P345, and `/find/{imdbId}` returns the one film TMDB says that id is —
// no folding, no year tolerance, no wrong Parasite.
//
// Fill-only, like every backfill here: rows are selected on `posterPath IS NULL`,
// most-documented first, and nothing already set is touched. `tmdbId` is written
// when TMDB tells us one, except when another row (a seeded original) already
// owns it — the poster still lands, the id is left alone, and the collision is
// reported as the duplicate signal it is.
import "./env";
import { prisma } from "../src/index";

const TOKEN = process.env.TMDB_ACCESS_TOKEN;
const KEY = process.env.TMDB_API_KEY;
if (!TOKEN && !KEY) {
  console.error(
    "No TMDB credential set (apps/web/.env.local): TMDB_ACCESS_TOKEN or TMDB_API_KEY.",
  );
  process.exit(1);
}

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

const LIMIT = arg("limit", 1000);
/**
 * Milliseconds between requests. TMDB allows ~50/s; 80ms (~12/s) leaves room
 * for everything else this key serves, and still clears 115,000 films in ~3h.
 */
const PACE = arg("pace", 80);
const DRY = process.argv.includes("--dry");

interface FindResult {
  movie_results: {
    id: number;
    poster_path: string | null;
    backdrop_path: string | null;
  }[];
}

/** One find call, with the only error worth waiting out waited out. */
async function find(imdbId: string, attempt = 1): Promise<FindResult> {
  const url = new URL(`https://api.themoviedb.org/3/find/${imdbId}`);
  if (!TOKEN) url.searchParams.set("api_key", KEY!);
  url.searchParams.set("external_source", "imdb_id");
  const res = await fetch(url, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429 && attempt <= 3) {
    const after = Number(res.headers.get("retry-after")) || attempt * 5;
    await new Promise((r) => setTimeout(r, after * 1000));
    return find(imdbId, attempt + 1);
  }
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json() as Promise<FindResult>;
}

async function main() {
  console.log(`TMDB → posters by IMDb id: up to ${LIMIT}${DRY ? " (dry run)" : ""}`);

  // Most-documented first, so a partial run dresses the films people actually
  // open. `image` (our own hosted artwork) outranks a TMDB path in Poster.tsx,
  // so rows that already have one are not worth a request yet.
  const films = await prisma.$queryRaw<
    { id: string; title: string; imdbId: string; tmdbId: number | null; backdropPath: string | null }[]
  >`
    SELECT id, title, "imdbId", "tmdbId", "backdropPath"
    FROM "Movie"
    WHERE "posterPath" IS NULL
      AND image IS NULL
      AND "imdbId" IS NOT NULL
    ORDER BY "wikidataSitelinks" DESC NULLS LAST, "releaseDate" DESC NULLS LAST
    LIMIT ${LIMIT}
  `;

  if (films.length === 0) {
    console.log("No film with an IMDb id is missing a poster. Nothing to do.");
    return;
  }
  console.log(`${films.length} films to try. First: ${films[0].title}\n`);

  let posters = 0;
  let noPoster = 0;
  let notOnTmdb = 0;
  let idCollisions = 0;
  const failed: string[] = [];

  for (const [i, film] of films.entries()) {
    try {
      const hit = (await find(film.imdbId)).movie_results[0];
      if (!hit) {
        notOnTmdb += 1;
      } else if (!hit.poster_path) {
        noPoster += 1;
      } else if (!DRY) {
        const data: Record<string, unknown> = { posterPath: hit.poster_path };
        if (!film.backdropPath && hit.backdrop_path) data.backdropPath = hit.backdrop_path;
        if (!film.tmdbId) data.tmdbId = hit.id;
        try {
          await prisma.movie.update({ where: { id: film.id }, data });
        } catch (e) {
          // Unique collision on tmdbId: another row — a seeded original — is
          // already that TMDB film. Keep the poster, drop the id, and say so:
          // this is how duplicate rows announce themselves.
          if ((e as { code?: string }).code !== "P2002" || !data.tmdbId) throw e;
          delete data.tmdbId;
          await prisma.movie.update({ where: { id: film.id }, data });
          idCollisions += 1;
        }
        posters += 1;
      } else {
        posters += 1;
      }
    } catch (e) {
      failed.push(`${film.title}: ${(e as Error).message.slice(0, 100)}`);
    }

    if ((i + 1) % 500 === 0) {
      console.log(
        `${String(i + 1).padStart(6)} tried: ${posters} posters · ${noPoster} without one · ${notOnTmdb} not on TMDB`,
      );
    }
    await new Promise((r) => setTimeout(r, PACE));
  }

  console.log(
    `\nPosters ${posters.toLocaleString("en-US")} · no poster on TMDB ${noPoster} · not on TMDB ${notOnTmdb} · failed ${failed.length}`,
  );
  if (idCollisions > 0) {
    console.warn(
      `${idCollisions} tmdbId collisions — those films likely exist twice (seeded + imported).`,
    );
  }
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
