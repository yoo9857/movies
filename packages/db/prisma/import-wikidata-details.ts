// The rest of a film page: synopsis, language, companies, rating, trailer, series.
//
//   npm run db:import-wikidata-details -- --limit=2000
//
// The bulk import filled identity and the credit pass filled the cast. What was
// still missing is everything that makes a film page read like a page rather than
// a table — above all the synopsis, which the seeded films have from TMDB and the
// 115,000 imported ones had not at all.
//
// Two sources, one pass:
//
//  · **Wikidata**, for facts, batched by QID. Coverage, measured over the 188,486
//    films this library covers: original language 107,609, production company
//    35,096, official website 12,750, YouTube trailer 8,237, MPAA rating 5,694,
//    film series 2,518. Each fills a column that already existed and was empty.
//
//  · **Wikipedia's REST summary**, for the synopsis, one request per film. Every
//    film here has an article — three language editions was the bar they were
//    imported on — so this is the one field with effectively full coverage.
//
// The synopsis is CC BY-SA, so it does not arrive anonymously: the article URL and
// the licence are stored with it and rendered under it. A CHECK constraint refuses
// the licence without the source. `Movie.overview` on a TMDB row keeps saying
// TMDB; nothing here overwrites a synopsis that is already present.
import "./env";
import { prisma } from "../src/index";

const SPARQL = "https://query.wikidata.org/sparql";
const WIKIPEDIA = "https://en.wikipedia.org/api/rest_v1/page/summary";
const USER_AGENT = "CinePixo/0.1 (https://cinepixo.com; devoh@signpost.kr) node-fetch";
/** What Wikipedia's own footer says its text is under. */
const WIKI_LICENSE = "CC BY-SA 4.0";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

const LIMIT = arg("limit", 1000);
const BATCH = Math.min(arg("batch", 60), 150);
/** Milliseconds between Wikipedia summaries. Their API is generous; be polite. */
const PACE = arg("pace", 250);
const DRY = process.argv.includes("--dry");

type Binding = Record<string, { value: string } | undefined>;

/**
 * Facts, one query per batch.
 *
 * `wdt:P1651` is a YouTube video id — usually the trailer, which is what the
 * player on the page expects. `P1657` is the MPAA rating as an item, so its label
 * ("R", "PG-13") is what gets stored, matching what the TMDB rows carry.
 */
function factsQuery(qids: string[]): string {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  return `
SELECT ?film
       (SAMPLE(?languageLabel) AS ?language)
       (SAMPLE(?ratingLabel) AS ?rating)
       (SAMPLE(?seriesLabel) AS ?series)
       (SAMPLE(?site) AS ?website)
       (SAMPLE(?youtube) AS ?trailer)
       (GROUP_CONCAT(DISTINCT ?companyLabel; separator="; ") AS ?companies)
WHERE {
  VALUES ?film { ${values} }
  OPTIONAL { ?film wdt:P364 ?language }
  OPTIONAL { ?film wdt:P1657 ?rating }
  OPTIONAL { ?film wdt:P179 ?series }
  OPTIONAL { ?film wdt:P856 ?site }
  OPTIONAL { ?film wdt:P1651 ?youtube }
  OPTIONAL { ?film wdt:P272 ?company }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?film
`;
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

interface Summary {
  extract: string | null;
  pageUrl: string | null;
}

/** The article's opening, and the article's URL to credit it with. */
async function summary(articleUrl: string): Promise<Summary | null> {
  let title: string;
  try {
    const path = new URL(articleUrl).pathname;
    if (!path.startsWith("/wiki/")) return null;
    title = path.slice("/wiki/".length);
  } catch {
    return null;
  }

  const res = await fetch(`${WIKIPEDIA}/${title}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  };
  const extract = json.extract?.trim();
  return {
    // Long enough to be a synopsis, short enough to stay an extract rather than
    // a republication of the article.
    extract: extract ? extract.slice(0, 1200) : null,
    pageUrl: json.content_urls?.desktop?.page ?? articleUrl,
  };
}

/** An unlabelled item's label is its Q-id; that is not a value. */
const labelled = (v: string | undefined) => (v && !/^Q[1-9][0-9]*$/.test(v) ? v : null);

/** YouTube ids are 11 characters of a known alphabet; anything else is not one. */
const youtubeKey = (v: string | undefined) =>
  v && /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null;

async function main() {
  console.log(`Wikidata + Wikipedia → film details: up to ${LIMIT}${DRY ? " (dry run)" : ""}`);

  // Most-documented first, and only rows still missing the synopsis — the field
  // this pass exists for. Nothing already filled is touched.
  const films = await prisma.$queryRaw<
    { id: string; wikidataId: string; title: string; wikipediaUrl: string | null }[]
  >`
    SELECT id, "wikidataId", title, "wikipediaUrl"
    FROM "Movie"
    WHERE "wikidataId" IS NOT NULL
      AND overview IS NULL
    ORDER BY "wikidataSitelinks" DESC NULLS LAST, "releaseDate" DESC NULLS LAST
    LIMIT ${LIMIT}
  `;

  if (films.length === 0) {
    console.log("Every film with a QID already has a synopsis. Nothing to do.");
    return;
  }
  console.log(`${films.length} films to fill. First: ${films[0].title}\n`);

  let synopses = 0;
  let facts = 0;
  let noArticle = 0;
  const skipped: string[] = [];

  for (let i = 0; i < films.length; i += BATCH) {
    const batch = films.slice(i, i + BATCH);
    const byQid = new Map(batch.map((f) => [f.wikidataId, f]));

    // ── Facts, one query for the batch ──
    const factsFor = new Map<string, Binding>();
    try {
      for (const b of await ask(factsQuery(batch.map((f) => f.wikidataId)))) {
        const qid = b.film?.value.split("/").pop();
        if (qid) factsFor.set(qid, b);
      }
    } catch (e) {
      console.warn(`!  batch ${i / BATCH + 1} facts: ${(e as Error).message}`);
    }

    // ── The article, per film ──
    for (const film of batch) {
      // The people pass stored the article for people, not films; a film's is
      // derived from its Wikidata sitelink, which the query below asks for only
      // when we do not already have it.
      let articleUrl = film.wikipediaUrl;
      if (!articleUrl) {
        try {
          const rows = await ask(`
SELECT ?article WHERE {
  ?article schema:about wd:${film.wikidataId} ; schema:isPartOf <https://en.wikipedia.org/> .
}
LIMIT 1`);
          articleUrl = rows[0]?.article?.value ?? null;
        } catch {
          articleUrl = null;
        }
      }

      const b = factsFor.get(film.wikidataId);
      const companies = (b?.companies?.value ?? "")
        .split(";")
        .map((c) => c.trim())
        .filter((c) => c && !/^Q[1-9][0-9]*$/.test(c))
        .slice(0, 8)
        .map((name) => ({ name, logoPath: null }));

      const data: Record<string, unknown> = {};
      const language = labelled(b?.language?.value);
      const rating = labelled(b?.rating?.value);
      const series = labelled(b?.series?.value);
      const website = b?.website?.value;
      const trailer = youtubeKey(b?.trailer?.value);
      if (language) data.originalLanguage = language;
      if (rating) data.certification = rating;
      if (series) data.collectionName = series;
      if (website?.startsWith("http")) data.homepage = website.slice(0, 500);
      if (trailer) data.trailerKey = trailer;
      if (companies.length > 0) data.companies = companies;
      if (articleUrl) data.wikipediaUrl = articleUrl;

      if (articleUrl) {
        const s = await summary(articleUrl);
        if (s?.extract) {
          data.overview = s.extract;
          // The licence's terms, stored with the text they apply to.
          data.overviewSourceUrl = s.pageUrl;
          data.overviewLicense = WIKI_LICENSE;
        }
        await new Promise((r) => setTimeout(r, PACE));
      } else {
        noArticle += 1;
      }

      if (Object.keys(data).length === 0) continue;
      if (DRY) {
        if (data.overview) synopses += 1;
        facts += 1;
        continue;
      }

      try {
        await prisma.movie.update({ where: { id: film.id }, data });
        if (data.overview) synopses += 1;
        facts += 1;
      } catch (e) {
        skipped.push(`${film.title}: ${(e as Error).message.split("\n").pop()}`);
      }
    }

    console.log(
      `batch ${String(i / BATCH + 1).padStart(3)}: ${synopses} synopses · ${facts} rows filled so far`,
    );
  }

  console.log(
    `\nSynopses ${synopses.toLocaleString("en-US")} · rows touched ${facts.toLocaleString("en-US")} · no article for ${noArticle}`,
  );
  if (skipped.length > 0) {
    console.warn(`${skipped.length} refused:`);
    for (const line of skipped.slice(0, 15)) console.warn(`  ${line}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
