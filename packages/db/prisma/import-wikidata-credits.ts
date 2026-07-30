// Cast, crew and box office for films already in the library, from Wikidata.
//
//   npm run db:import-wikidata-credits                  # 500 films, most documented first
//   npm run db:import-wikidata-credits -- --limit=5000
//   npm run db:import-wikidata-credits -- --limit=50 --dry
//
// The bulk film import deliberately fetched one row per film: adding twenty cast
// members to each query multiplies the result set by twenty and pushes the whole
// year past the query service's limit. So credits are a second pass, and a
// prioritised one — the library is six figures deep and most of it nobody will
// ever open, so films are taken in the order that matters: the ones this site has
// written about first, then by how many Wikipedia editions bothered to document
// them.
//
// What arrives: names, roles and characters, with a Q-id each. What does not:
// photographs. Wikidata has no still of an actor to give, and film posters are
// non-free. The people these credits create can then be enriched from Wikipedia
// — portrait, dates, occupations — which also needs no credential; that is what
// the admin's "Enrich all" already does.
import "./env";
import { prisma } from "../src/index";
import { linkCreditsToPeople } from "../src/people-link";

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "CinePixo/0.1 (https://cinepixo.com; devoh@signpost.kr) node-fetch";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

const LIMIT = arg("limit", 500);
const BATCH = Math.min(arg("batch", 40), 100);
const DRY = process.argv.includes("--dry");

/** Wikidata property → the job name this project already uses for it. */
const CREW_PROPERTIES: [property: string, job: string, department: string][] = [
  ["P57", "Director", "Directing"],
  ["P58", "Screenplay", "Writing"],
  ["P344", "Director of Photography", "Camera"],
  ["P86", "Original Music Composer", "Sound"],
  ["P1040", "Editor", "Editing"],
  ["P162", "Producer", "Production"],
];

const MAX_CAST = 20;
const MAX_CREW = 12;

interface CreditRow {
  filmQid: string;
  role: string;
  personQid: string;
  personName: string;
  character: string | null;
  ordinal: number | null;
}

type Binding = Record<string, { value: string } | undefined>;

/**
 * Cast, from the statements rather than the plain values.
 *
 * The character a performer plays is a qualifier on the statement (P453 as an
 * item, P4633 where no item exists), and so is the billing position (P1545).
 *
 * `SERVICE wikibase:label` rather than an rdfs:label join with a language
 * FILTER: the label service is the pattern the query service optimises for, and
 * the difference is not marginal. Cast and crew in one query with seven UNIONs
 * and manual label joins timed out at 504 for *five* films; split in two and
 * asking the label service, eight films answer in a second.
 */
function castQuery(qids: string[]): string {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  return `
SELECT ?film ?person ?personLabel ?charLabel ?charName ?ordinal WHERE {
  VALUES ?film { ${values} }
  ?film p:P161 ?statement .
  ?statement ps:P161 ?person .
  OPTIONAL { ?statement pq:P453 ?char }
  OPTIONAL { ?statement pq:P4633 ?charName }
  OPTIONAL { ?statement pq:P1545 ?ordinal }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`;
}

/**
 * Crew, with the property as a variable.
 *
 * `VALUES ?prop { wdt:P57 … }` collapses what would otherwise be six UNION
 * branches into one pattern the planner handles in a single pass.
 */
function crewQuery(qids: string[]): string {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const properties = CREW_PROPERTIES.map(([property]) => `wdt:${property}`).join(" ");
  return `
SELECT ?film ?prop ?person ?personLabel WHERE {
  VALUES ?film { ${values} }
  VALUES ?prop { ${properties} }
  ?film ?prop ?person .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`;
}

/**
 * Box office and budget, in US dollars only.
 *
 * These properties carry a unit, and plenty of films record theirs in yen, won or
 * francs. Reading the bare amount would put ¥2,000,000,000 in a column the page
 * renders with a dollar sign, so the query asks for the amount *and* pins the
 * unit to USD (Q4917); anything else is left null rather than mislabelled.
 */
function moneyQuery(qids: string[]): string {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  return `
SELECT ?film (SAMPLE(?boxOffice) AS ?revenue) (SAMPLE(?budgetAmount) AS ?budget)
WHERE {
  VALUES ?film { ${values} }
  OPTIONAL {
    ?film p:P2142/psv:P2142 [ wikibase:quantityAmount ?boxOffice ; wikibase:quantityUnit wd:Q4917 ]
  }
  OPTIONAL {
    ?film p:P2130/psv:P2130 [ wikibase:quantityAmount ?budgetAmount ; wikibase:quantityUnit wd:Q4917 ]
  }
}
GROUP BY ?film
`;
}

async function ask(query: string, attempt = 1): Promise<Binding[]> {
  const res = await fetch(ENDPOINT, {
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
      const wait = attempt * 20_000;
      console.warn(`   HTTP ${res.status}, retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      return ask(query, attempt + 1);
    }
    throw new Error(`Wikidata HTTP ${res.status}`);
  }

  const json = (await res.json()) as { results: { bindings: Binding[] } };
  return json.results.bindings;
}

const qidOf = (uri: string | undefined) => {
  const id = uri?.split("/").pop() ?? "";
  return /^Q[1-9][0-9]*$/.test(id) ? id : null;
};

async function main() {
  console.log(
    `Wikidata → credits: up to ${LIMIT} films, ${BATCH} per query${DRY ? " (dry run)" : ""}`,
  );

  // Films worth filling in first: the ones carrying our own writing, then the
  // most widely documented. `sitelinks` is null for anything imported before that
  // column existed, and NULLS LAST puts those at the back rather than the front.
  const films = await prisma.$queryRaw<{ id: string; wikidataId: string; title: string }[]>`
    SELECT m.id, m."wikidataId", m.title
    FROM "Movie" m
    WHERE m."wikidataId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "MovieCast" c WHERE c."movieId" = m.id)
      AND NOT EXISTS (SELECT 1 FROM "MovieCrew" w WHERE w."movieId" = m.id)
    ORDER BY
      (EXISTS (SELECT 1 FROM "Review" r WHERE r."movieId" = m.id AND r.status = 'PUBLISHED')
       OR EXISTS (SELECT 1 FROM "MovieTopic" t WHERE t."movieId" = m.id)) DESC,
      m."wikidataSitelinks" DESC NULLS LAST,
      m."releaseDate" DESC NULLS LAST
    LIMIT ${LIMIT}
  `;

  if (films.length === 0) {
    console.log("Every film with a QID already has credits. Nothing to do.");
    return;
  }
  console.log(`${films.length} films need credits. First: ${films[0].title}\n`);

  const byQid = new Map(films.map((f) => [f.wikidataId, f]));
  let castRows = 0;
  let crewRows = 0;
  let peopleLinked = 0;
  let moneyFilled = 0;

  for (let i = 0; i < films.length; i += BATCH) {
    const batch = films.slice(i, i + BATCH);
    const qids = batch.map((f) => f.wikidataId);

    let credits: CreditRow[] = [];
    let money: Binding[] = [];
    try {
      const [castBindings, crewBindings, moneyBindings] = await Promise.all([
        ask(castQuery(qids)),
        ask(crewQuery(qids)),
        ask(moneyQuery(qids)),
      ]);
      money = moneyBindings;

      const jobOf = (propertyUri: string | undefined) => {
        const property = propertyUri?.split("/").pop() ?? "";
        return CREW_PROPERTIES.find(([p]) => p === property);
      };

      // The label service leaves a label unbound when the entity has none in
      // English; a person we cannot name is a credit we cannot show, so it goes.
      const named = (b: Binding) => {
        const uri = b.person?.value;
        const label = b.personLabel?.value?.trim();
        // An unlabelled entity's "label" is the Q-id itself; that is not a name.
        return label && label !== uri?.split("/").pop() ? label : null;
      };

      credits = [
        ...castBindings.flatMap((b) => {
          const filmQid = qidOf(b.film?.value);
          const personQid = qidOf(b.person?.value);
          const name = named(b);
          if (!filmQid || !personQid || !name) return [];
          const ordinal = b.ordinal ? Number(b.ordinal.value) : NaN;
          const character = b.charLabel?.value ?? b.charName?.value ?? null;
          return [
            {
              filmQid,
              role: "cast",
              personQid,
              personName: name.slice(0, 200),
              // A character with no English label comes back as its Q-id.
              character:
                character && !/^Q[1-9][0-9]*$/.test(character) ? character.slice(0, 200) : null,
              ordinal: Number.isFinite(ordinal) ? ordinal : null,
            },
          ];
        }),
        ...crewBindings.flatMap((b) => {
          const filmQid = qidOf(b.film?.value);
          const personQid = qidOf(b.person?.value);
          const name = named(b);
          const job = jobOf(b.prop?.value);
          if (!filmQid || !personQid || !name || !job) return [];
          return [
            {
              filmQid,
              role: job[1],
              personQid,
              personName: name.slice(0, 200),
              character: null,
              ordinal: null,
            },
          ];
        }),
      ];
    } catch (e) {
      console.warn(`!  batch ${i / BATCH + 1}: ${(e as Error).message}`);
      continue;
    }

    // Group by film, then split cast from crew.
    const perFilm = new Map<string, CreditRow[]>();
    for (const c of credits) {
      const list = perFilm.get(c.filmQid);
      if (list) list.push(c);
      else perFilm.set(c.filmQid, [c]);
    }

    for (const [filmQid, rows] of perFilm) {
      const film = byQid.get(filmQid);
      if (!film) continue;

      // One row per person per role. Wikidata repeats a statement when it has
      // several qualifier sets, and a character with two labels arrives twice.
      const castSeen = new Map<string, CreditRow>();
      const crewSeen = new Map<string, CreditRow>();
      for (const r of rows) {
        const key = `${r.personQid}:${r.role}`;
        const bucket = r.role === "cast" ? castSeen : crewSeen;
        const existing = bucket.get(key);
        if (!existing) bucket.set(key, r);
        // Prefer the row that names a character or carries a billing ordinal.
        else if (!existing.character && r.character) existing.character = r.character;
        else if (existing.ordinal == null && r.ordinal != null) existing.ordinal = r.ordinal;
      }

      // Wikidata has no billing order for most films; where a statement carries
      // one it is used, and everyone else keeps the order the query returned —
      // which is arbitrary, so it is not presented as billing anywhere.
      const cast = [...castSeen.values()]
        .sort((a, b) => (a.ordinal ?? 9_999) - (b.ordinal ?? 9_999))
        .slice(0, MAX_CAST);
      const crew = [...crewSeen.values()].slice(0, MAX_CREW);

      if (DRY) {
        console.log(`   ${film.title}: ${cast.length} cast, ${crew.length} crew`);
        castRows += cast.length;
        crewRows += crew.length;
        continue;
      }

      const linked = await prisma.$transaction(async (tx) => {
        if (cast.length > 0) {
          await tx.movieCast.createMany({
            data: cast.map((c, index) => ({
              movieId: film.id,
              wikidataPersonId: c.personQid,
              name: c.personName,
              character: c.character,
              order: c.ordinal ?? index,
            })),
          });
        }
        if (crew.length > 0) {
          await tx.movieCrew.createMany({
            data: crew.map((c) => ({
              movieId: film.id,
              wikidataPersonId: c.personQid,
              name: c.personName,
              job: c.role,
              department:
                CREW_PROPERTIES.find(([, job]) => job === c.role)?.[2] ?? null,
            })),
          });
        }
        // Credits become people, claiming rows the site already knows rather than
        // duplicating them. This is what grows /people.
        return linkCreditsToPeople(tx, film.id);
      });

      castRows += cast.length;
      crewRows += crew.length;
      peopleLinked += linked;
    }

    // Box office and budget, filled only where the column is still empty.
    if (!DRY) {
      for (const b of money) {
        const filmQid = qidOf(b.film?.value);
        const film = filmQid ? byQid.get(filmQid) : undefined;
        if (!film) continue;
        const revenue = b.revenue ? Number(b.revenue.value) : NaN;
        const budget = b.budget ? Number(b.budget.value) : NaN;
        const data: { revenue?: number; budget?: number } = {};
        if (Number.isFinite(revenue) && revenue > 0) data.revenue = revenue;
        if (Number.isFinite(budget) && budget > 0) data.budget = budget;
        if (Object.keys(data).length === 0) continue;
        await prisma.movie.update({ where: { id: film.id }, data });
        moneyFilled += 1;
      }
    }

    console.log(
      `batch ${String(i / BATCH + 1).padStart(3)}: ${perFilm.size}/${batch.length} films answered · ${castRows} cast · ${crewRows} crew so far`,
    );
    await new Promise((r) => setTimeout(r, 400));
  }

  const people = await prisma.person.count();
  console.log(
    `\nCast rows ${castRows.toLocaleString("en-US")} · crew rows ${crewRows.toLocaleString("en-US")} · credits linked ${peopleLinked.toLocaleString("en-US")} · box office/budget filled ${moneyFilled}`,
  );
  console.log(`People in the library: ${people.toLocaleString("en-US")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
