// Fill the library from Wikidata. No API key, and every fact traceable to a QID.
//
//   npm run db:import-wikidata                    # 1900–this year, ≥3 sitelinks
//   npm run db:import-wikidata -- --min-sitelinks=10 --from=1970 --to=1979
//   npm run db:import-wikidata -- --dry           # fetch and report, write nothing
//
// Why Wikidata and not TMDB: TMDB needs a credential this project does not have,
// and its terms make its images the thing you may not keep. Wikidata answers
// without a key, carries an IMDb id and a director for ~306,000 films, and gives
// every row a citable identity. What it does not carry is a poster — film
// posters are non-free, so those rows arrive without artwork, and a later pass
// with a TMDB key can fill them in for whichever slice earns the attention.
//
// The work is chunked by release year because the query service has a hard 60s
// limit and "every film ever" is far past it. Each year is independent, so an
// interrupted run resumes by simply running again: rows are keyed on the QID and
// existing ones are left untouched.
import "./env";
import { movieSlug } from "../../shared/src/index";
import { prisma } from "../src/index";

const ENDPOINT = "https://query.wikidata.org/sparql";
// Wikidata asks for a descriptive agent with a way to make contact. Anonymous
// bulk querying is what gets a project blocked.
const USER_AGENT = "CinePixo/0.1 (https://cinepixo.com; devoh@signpost.kr) node-fetch";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

const MIN_SITELINKS = arg("min-sitelinks", 3);
const FROM = arg("from", 1900);
const TO = arg("to", new Date().getUTCFullYear());
const DRY = process.argv.includes("--dry");
/**
 * Fill in `wikidataSitelinks` for films already imported, and nothing else.
 *
 * The column arrived after the first bulk run had started, so tens of thousands
 * of rows have none — and it is the ordering key every backfill uses, so those
 * rows would sort last forever. This mode asks each year for nothing but ids and
 * sitelink counts, which is a fraction of the work of a full year fetch.
 */
const SITELINKS_ONLY = process.argv.includes("--sitelinks-only");

/**
 * One year of films.
 *
 * `wikibase:sitelinks` is the notability bar: the number of Wikipedia editions
 * that wrote an article. It is a far better filter than popularity for this
 * site's purposes — it favours films people in several languages bothered to
 * document over films that trended once.
 *
 * Labels are joined explicitly rather than through wikibase:label, which cannot
 * be combined with GROUP_CONCAT. Aggregating here rather than per film keeps the
 * whole year to one request.
 */
function query(year: number): string {
  return `
SELECT ?film ?title ?imdb ?sitelinks
       (MIN(?date) AS ?first)
       (SAMPLE(?runtimeValue) AS ?runtime)
       (GROUP_CONCAT(DISTINCT ?directorName; separator="; ") AS ?directors)
       (GROUP_CONCAT(DISTINCT ?countryName;  separator="; ") AS ?countries)
       (GROUP_CONCAT(DISTINCT ?genreName;    separator="; ") AS ?genres)
       (SAMPLE(?originalTitle) AS ?original)
WHERE {
  ?film wdt:P31 wd:Q11424 ;
        wdt:P345 ?imdb ;
        wdt:P57  ?director ;
        wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${MIN_SITELINKS})
  # The year selects which films this chunk covers; the date column stays
  # unfiltered so MIN() below is the film's own earliest release. Filtering the
  # aggregated variable itself gave "A Few Good Men" a 1994 release date,
  # because that was the earliest date the 1994 chunk was allowed to see.
  ?film wdt:P577 ?date .
  FILTER EXISTS { ?film wdt:P577 ?chunkDate . FILTER(YEAR(?chunkDate) = ${year}) }
  ?film rdfs:label ?title . FILTER(LANG(?title) = "en")
  ?director rdfs:label ?directorName . FILTER(LANG(?directorName) = "en")
  OPTIONAL { ?film wdt:P2047 ?runtimeValue }
  OPTIONAL { ?film wdt:P1476 ?originalTitle }
  OPTIONAL { ?film wdt:P495 ?country . ?country rdfs:label ?countryName . FILTER(LANG(?countryName) = "en") }
  OPTIONAL { ?film wdt:P136 ?genre . ?genre rdfs:label ?genreName . FILTER(LANG(?genreName) = "en") }
}
GROUP BY ?film ?title ?imdb ?sitelinks
`;
}

/**
 * Wikidata's genres are free-form ("buddy film", "film based on literature",
 * "chanbara"), and there are thousands of them. Dropped into Movie.genres they
 * would turn the library's genre filter — and its indexable /movies?genre= URLs
 * — into a list nobody can use.
 *
 * So they are mapped onto the same nineteen the film database uses, which is what
 * the existing rows carry and what the filter UI expects. A genre with no mapping
 * is discarded rather than invented: better a film with two genres than a filter
 * with two thousand.
 */
const CANONICAL = new Set([
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama",
  "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance",
  "Science Fiction", "TV Movie", "Thriller", "War", "Western",
]);

const ALIASES: Record<string, string> = {
  "science fiction": "Science Fiction",
  "sci fi": "Science Fiction",
  "romantic comedy": "Romance",
  "romantic drama": "Romance",
  "historical drama": "History",
  "historical": "History",
  "biographical": "History",
  "biographical drama": "History",
  "docufiction": "Documentary",
  "documentary": "Documentary",
  "war": "War",
  "spy": "Thriller",
  "psychological thriller": "Thriller",
  "crime": "Crime",
  "crime thriller": "Crime",
  "gangster": "Crime",
  "film noir": "Crime",
  "neo noir": "Crime",
  "musical": "Music",
  "animated": "Animation",
  "anime": "Animation",
  "black comedy": "Comedy",
  "comedy drama": "Comedy",
  "satire": "Comedy",
  "slasher": "Horror",
  "supernatural horror": "Horror",
  "martial arts": "Action",
  "superhero": "Action",
  "spaghetti western": "Western",
  "children s": "Family",
  "coming of age": "Drama",
  "melodrama": "Drama",
  "epic": "Adventure",
  "swashbuckler": "Adventure",
  "fantasy": "Fantasy",
  "detective": "Mystery",
  "whodunit": "Mystery",
};

/** "science fiction film" → "Science Fiction"; unmappable → null. */
function canonicalGenre(raw: string): string | null {
  const bare = raw
    .toLowerCase()
    .replace(/\bfilms?\b/g, " ")
    .replace(/\bmovies?\b/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!bare) return null;
  const titled = bare.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  if (CANONICAL.has(titled)) return titled;
  return ALIASES[bare] ?? null;
}

interface Row {
  qid: string;
  title: string;
  originalTitle: string | null;
  imdbId: string;
  releaseDate: Date;
  runtime: number | null;
  directors: string[];
  countries: string[];
  genres: string[];
  sitelinks: number;
}

type Binding = Record<string, { value: string } | undefined>;

async function fetchYear(year: number, attempt = 1): Promise<Row[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ query: query(year) }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    // 429 and 503 are the service asking for patience, not a failure. Three
    // tries with a widening pause, then give up on this year and keep going —
    // one missing year is better than an aborted run.
    if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
      const wait = attempt * 20_000;
      console.warn(`   ${year}: HTTP ${res.status}, retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      return fetchYear(year, attempt + 1);
    }
    throw new Error(`Wikidata HTTP ${res.status} for ${year}`);
  }

  const json = (await res.json()) as { results: { bindings: Binding[] } };
  // Keyed by QID: a film with two IMDb ids on Wikidata (it happens) comes back
  // as two otherwise identical rows, and grouping cannot collapse what it groups
  // by. First one wins.
  const byQid = new Map<string, Row>();

  for (const b of json.results.bindings) {
    const qid = b.film?.value.split("/").pop();
    // The earliest of the film's publication dates. Wikidata holds one per
    // country, which is why this is MIN() in the query and not a plain column:
    // grouping on the raw date returned Pulp Fiction three times.
    const iso = b.first?.value;
    if (!qid || !/^Q[1-9][0-9]*$/.test(qid) || !iso || !b.title?.value || !b.imdb?.value) continue;

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;

    const list = (raw: string | undefined) =>
      (raw ?? "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        // A film with fourteen listed anything is describing nothing; the page
        // shows a handful, so store a handful.
        .slice(0, 6);

    const genres = [
      ...new Set(
        (b.genres?.value ?? "")
          .split(";")
          .map((g) => canonicalGenre(g.trim()))
          .filter((g): g is string => g !== null),
      ),
    ].slice(0, 5);

    // Minutes, and only if it is a plausible running time — Wikidata holds the
    // occasional 0 or 6000, and the Movie CHECK constraint rejects both.
    const minutes = b.runtime ? Math.round(Number(b.runtime.value)) : NaN;

    if (byQid.has(qid)) continue;
    byQid.set(qid, {
      qid,
      title: b.title.value.slice(0, 300),
      originalTitle: b.original?.value?.slice(0, 300) ?? null,
      imdbId: b.imdb.value,
      releaseDate: date,
      runtime: Number.isFinite(minutes) && minutes > 0 && minutes <= 1000 ? minutes : null,
      directors: list(b.directors?.value),
      countries: list(b.countries?.value),
      genres,
      sitelinks: Number(b.sitelinks?.value ?? 0),
    });
  }

  return [...byQid.values()];
}

/**
 * Slugs are minted in memory against every slug already taken.
 *
 * The alternative — one findUnique per film to test for a collision — is a
 * round trip per row, and there are six figures of rows. Titles collide often
 * enough that the suffix path is not an edge case: there are four films called
 * "The Mummy" and a dozen called "Home".
 */
function slugMinter(taken: Set<string>) {
  return (title: string, releaseDate: Date): string => {
    const base = movieSlug(title, releaseDate);
    if (!taken.has(base)) {
      taken.add(base);
      return base;
    }
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
      }
    }
  };
}

/** ids and sitelink counts only — the cheap query behind `--sitelinks-only`. */
function sitelinksQuery(year: number): string {
  return `
SELECT ?film ?sitelinks WHERE {
  ?film wdt:P31 wd:Q11424 ; wdt:P345 ?imdb ; wdt:P57 ?director ; wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${MIN_SITELINKS})
  FILTER EXISTS { ?film wdt:P577 ?chunkDate . FILTER(YEAR(?chunkDate) = ${year}) }
}
`;
}

async function backfillSitelinks() {
  console.log(`Filling wikidataSitelinks for ${FROM}–${TO} (≥${MIN_SITELINKS})`);
  let updated = 0;

  for (let year = FROM; year <= TO; year++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ query: sitelinksQuery(year) }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      console.warn(`!  ${year}: HTTP ${res.status}`);
      continue;
    }

    const json = (await res.json()) as { results: { bindings: Binding[] } };
    const pairs = json.results.bindings.flatMap((b) => {
      const qid = b.film?.value.split("/").pop();
      const n = Number(b.sitelinks?.value ?? NaN);
      return qid && /^Q[1-9][0-9]*$/.test(qid) && Number.isFinite(n) ? [[qid, n] as const] : [];
    });

    // One UPDATE per year rather than per film: a VALUES list joined against the
    // table. Only rows that are still null are touched, so a rerun is free.
    for (let i = 0; i < pairs.length; i += 1000) {
      const chunk = pairs.slice(i, i + 1000);
      if (chunk.length === 0) continue;
      const values = chunk.map(([qid, n]) => `('${qid}',${n})`).join(",");
      const count = await prisma.$executeRawUnsafe(
        `UPDATE "Movie" m SET "wikidataSitelinks" = v.n
           FROM (VALUES ${values}) AS v(qid, n)
          WHERE m."wikidataId" = v.qid AND m."wikidataSitelinks" IS NULL`,
      );
      updated += count;
    }

    console.log(`${year}: ${String(pairs.length).padStart(5)} on Wikidata · ${updated} filled so far`);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nFilled ${updated.toLocaleString("en-US")} rows.`);
}

async function main() {
  if (SITELINKS_ONLY) return backfillSitelinks();

  console.log(
    `Wikidata → library: ${FROM}–${TO}, films with an IMDb id, a director and ≥${MIN_SITELINKS} Wikipedia editions${DRY ? " (dry run)" : ""}`,
  );

  // Two sets, read once: which QIDs are already ours, and which slugs are spoken
  // for. At a few hundred thousand rows this is a few megabytes and saves one
  // query per film.
  const existing = await prisma.movie.findMany({
    select: { slug: true, wikidataId: true },
  });
  const knownQids = new Set(existing.map((m) => m.wikidataId).filter((q): q is string => !!q));
  const mint = slugMinter(new Set(existing.map((m) => m.slug)));
  console.log(`Already here: ${existing.length} films (${knownQids.size} with a QID)\n`);

  let fetched = 0;
  let inserted = 0;
  let known = 0;
  const failedYears: number[] = [];
  const rejected: string[] = [];

  for (let year = FROM; year <= TO; year++) {
    let rows: Row[];
    try {
      rows = await fetchYear(year);
    } catch (e) {
      failedYears.push(year);
      console.warn(`!  ${year}: ${(e as Error).message}`);
      continue;
    }
    fetched += rows.length;

    const fresh = rows.filter((r) => !knownQids.has(r.qid));
    known += rows.length - fresh.length;

    if (!DRY && fresh.length > 0) {
      const data = fresh.map((r) => {
        knownQids.add(r.qid);
        return {
          wikidataId: r.qid,
          imdbId: r.imdbId,
          slug: mint(r.title, r.releaseDate),
          title: r.title,
          originalTitle: r.originalTitle,
          releaseDate: r.releaseDate,
          runtime: r.runtime,
          director: r.directors.join(", ") || null,
          genres: r.genres,
          countries: r.countries,
          keywords: [],
          // Kept because every later backfill — credits, and posters if a
          // credential ever appears — has to choose an order to work through six
          // figures of films, and "how many Wikipedia editions wrote about it" is
          // the only ranking signal these rows arrive with.
          wikidataSitelinks: r.sitelinks,
        };
      });

      // Chunked: one 5,000-row INSERT is a long transaction holding locks for no
      // reason. skipDuplicates covers the case of two QIDs racing to the same
      // slug across an interrupted run.
      //
      // A batch that fails is retried row by row, because a single unacceptable
      // row used to take 499 good ones with it and end the whole run — which is
      // how "-30-" (1959) stopped an import at year 59 of 127. The offending row
      // is named and skipped rather than silently dropped.
      for (let i = 0; i < data.length; i += 500) {
        const batch = data.slice(i, i + 500);
        try {
          const { count } = await prisma.movie.createMany({ data: batch, skipDuplicates: true });
          inserted += count;
        } catch {
          for (const row of batch) {
            try {
              await prisma.movie.create({ data: row });
              inserted += 1;
            } catch (e) {
              rejected.push(`${row.title} (${row.wikidataId}): ${(e as Error).message.split("\n").pop()}`);
            }
          }
        }
      }
    }

    console.log(
      `${year}: ${String(rows.length).padStart(5)} on Wikidata · ${String(fresh.length).padStart(5)} new${DRY ? "" : " · inserted"}`,
    );

    // A courtesy pause between years. The service is free and shared.
    await new Promise((r) => setTimeout(r, 400));
  }

  const total = await prisma.movie.count();
  console.log(
    `\nFetched ${fetched.toLocaleString("en-US")} · already known ${known.toLocaleString("en-US")} · inserted ${inserted.toLocaleString("en-US")}`,
  );
  console.log(`Library now holds ${total.toLocaleString("en-US")} films.`);
  if (failedYears.length > 0) {
    console.warn(`Years that did not answer: ${failedYears.join(", ")} — rerun to pick them up.`);
  }
  if (rejected.length > 0) {
    console.warn(`\n${rejected.length} row(s) the database refused:`);
    for (const line of rejected.slice(0, 20)) console.warn(`  ${line}`);
    if (rejected.length > 20) console.warn(`  …and ${rejected.length - 20} more`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
