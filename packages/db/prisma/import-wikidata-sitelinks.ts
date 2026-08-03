// Sitelink counts for films that were imported without one.
//
//   npm run db:import-sitelinks -- --dry --limit=400
//   npm run db:import-sitelinks -- --limit=40000
//
// `Movie.wikidataSitelinks` is how many Wikipedia language editions have an
// article about a film, and on this site it is load-bearing in two places:
//
//   · `/api/v1/movies/search` orders results by it, so it decides whether typing
//     "batman" offers Batman Begins or a straight-to-video sequel that shares the
//     word.
//   · it is the only notability signal the library has at all. The TMDB fields
//     (voteAverage, voteCount, tmdbId) are populated on nine rows out of 118,811,
//     because no TMDB key was ever configured.
//
// It is null on 33,667 films — every one of which has a Q-id, and 31,857 of which
// have a Wikipedia article. Among them: Tokyo Story, The Third Man, Roman Holiday,
// The 400 Blows. So the search ranks a third of the library last, and the canon
// disproportionately, purely because one count was not fetched.
//
// The query asks Wikidata to count the sitelinks it already stores, in batches of
// Q-ids. Fill-only and idempotent: a film that already has a count is never
// selected, and a film Wikidata answers nothing for is left null rather than
// written as zero — zero is a claim ("no article anywhere") and null is the truth
// ("we did not learn").
import "./env";
import { prisma } from "../src/index";

const SPARQL = "https://query.wikidata.org/sparql";
const USER_AGENT = "CinePixo/0.1 (https://cinepixo.com; devoh@signpost.kr) node-fetch";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

const LIMIT = arg("limit", 2000);
/** Q-ids per request. 250 keeps the query under Wikidata's 60-second budget. */
const BATCH = arg("batch", 250);
/** Milliseconds between requests — Wikidata asks for one query at a time. */
const PACE = arg("pace", 1200);
const DRY = process.argv.includes("--dry");

interface Binding {
  film?: { value: string };
  links?: { value: string };
}

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
 * One count per film.
 *
 * `schema:about` is the link from a Wikipedia page to its item, so counting those
 * *is* the sitelink count — no need to ask for the pages themselves. DISTINCT
 * because an item can be linked from several projects of one language.
 */
const countQuery = (qids: string[]) => `
SELECT ?film (COUNT(DISTINCT ?article) AS ?links) WHERE {
  VALUES ?film { ${qids.map((q) => `wd:${q}`).join(" ")} }
  ?article schema:about ?film .
}
GROUP BY ?film
`;

const qidOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);

async function main() {
  const pending = await prisma.movie.findMany({
    where: { wikidataSitelinks: null, wikidataId: { not: null } },
    // Films with an article first: they are the ones whose count is certainly
    // non-zero, and the ones a search is most likely to be ranking.
    orderBy: [{ wikipediaUrl: { sort: "desc", nulls: "last" } }, { releaseDate: "desc" }],
    take: LIMIT,
    select: { id: true, wikidataId: true, title: true },
  });

  const remaining = await prisma.movie.count({
    where: { wikidataSitelinks: null, wikidataId: { not: null } },
  });

  console.log(
    `${DRY ? "[dry] " : ""}${pending.length} of ${remaining} films without a sitelink count · ` +
      `batch ${BATCH} · pace ${PACE}ms`,
  );
  if (pending.length === 0) return;

  let filled = 0;
  let unanswered = 0;
  let batches = 0;

  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);
    const byQid = new Map(slice.map((m) => [m.wikidataId as string, m]));

    let bindings: Binding[];
    try {
      bindings = await ask(countQuery([...byQid.keys()]));
    } catch (err) {
      // One failed batch must not end a 34,000-film pass; the queue is derived
      // from the data, so re-running picks these up again.
      console.log(`  batch ${batches + 1}: FAILED ${(err as Error).message}`);
      batches++;
      await new Promise((r) => setTimeout(r, PACE));
      continue;
    }

    const answered = new Set<string>();
    for (const b of bindings) {
      if (!b.film?.value || !b.links?.value) continue;
      const qid = qidOf(b.film.value);
      const movie = byQid.get(qid);
      if (!movie) continue;
      const links = Number(b.links.value);
      if (!Number.isFinite(links) || links < 0) continue;
      answered.add(qid);
      if (!DRY) {
        // Guarded on still-null, so a concurrent pass cannot be overwritten.
        await prisma.movie.updateMany({
          where: { id: movie.id, wikidataSitelinks: null },
          data: { wikidataSitelinks: links },
        });
      }
      filled++;
    }
    unanswered += slice.length - answered.size;
    batches++;
    if (batches % 10 === 0 || i + BATCH >= pending.length) {
      console.log(`  ${filled} filled, ${unanswered} unanswered, ${batches} batches`);
    }
    await new Promise((r) => setTimeout(r, PACE));
  }

  console.log(`\n${DRY ? "[dry] " : ""}filled=${filled} unanswered=${unanswered} batches=${batches}`);
  if (!DRY) {
    const left = await prisma.movie.count({
      where: { wikidataSitelinks: null, wikidataId: { not: null } },
    });
    console.log(`still null: ${left}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
