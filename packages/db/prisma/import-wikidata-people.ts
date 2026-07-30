// Facts for the people the credit import created, from Wikidata.
//
//   npm run db:import-wikidata-people                 # 2,000 most-credited first
//   npm run db:import-wikidata-people -- --limit=20000
//
// Credits arrive with a Q-id per person, so these rows can be filled without a
// search step: birth and death, birthplace, occupations, and the English
// Wikipedia article. That is what turns a name in a cast list into a page worth
// opening.
//
// Two things this deliberately does not write:
//
//  · **bio.** The schema says it outright — the facts can be imported, the prose
//    is the site. An encyclopedia paragraph pasted into our voice would also drag
//    CC BY-SA licensing onto every person page.
//  · **image.** Portraits live on our own storage, which means downloading and
//    re-encoding each one; at half a million people that is a different job with
//    a different budget. The admin's portrait desk does it for the people who
//    matter, and `wikipediaUrl` here is what points it at the right article.
//
// Imprecise dates are skipped rather than rounded. Wikidata records "1888" as
// 1888-01-01 with a precision flag, and a page that prints "1 January 1888" for a
// man whose birthday nobody knows is asserting something it was not told.
import "./env";
import { prisma } from "../src/index";

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "CinePixo/0.1 (https://cinepixo.com; devoh@signpost.kr) node-fetch";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

const LIMIT = arg("limit", 2000);
const BATCH = Math.min(arg("batch", 60), 150);
const DRY = process.argv.includes("--dry");

/** Wikidata time precision: 11 is "day", anything lower is a year or a decade. */
const DAY_PRECISION = 11;

type Binding = Record<string, { value: string } | undefined>;

function query(qids: string[]): string {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  return `
SELECT ?person ?birth ?birthPrecision ?death ?deathPrecision ?birthPlaceLabel ?occupationLabel ?article
WHERE {
  VALUES ?person { ${values} }
  OPTIONAL { ?person p:P569/psv:P569 [ wikibase:timeValue ?birth ; wikibase:timePrecision ?birthPrecision ] }
  OPTIONAL { ?person p:P570/psv:P570 [ wikibase:timeValue ?death ; wikibase:timePrecision ?deathPrecision ] }
  OPTIONAL { ?person wdt:P19 ?birthPlace }
  OPTIONAL { ?person wdt:P106 ?occupation }
  OPTIONAL { ?article schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
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
      await new Promise((r) => setTimeout(r, attempt * 20_000));
      return ask(sparql, attempt + 1);
    }
    throw new Error(`Wikidata HTTP ${res.status}`);
  }
  const json = (await res.json()) as { results: { bindings: Binding[] } };
  return json.results.bindings;
}

interface Facts {
  birthDate: Date | null;
  deathDate: Date | null;
  birthPlace: string | null;
  occupations: Set<string>;
  wikipediaUrl: string | null;
}

/** A date only if Wikidata knows the actual day. */
function preciseDate(value: string | undefined, precision: string | undefined): Date | null {
  if (!value || Number(precision ?? 0) < DAY_PRECISION) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** An unlabelled entity's label is its own Q-id; that is not a value. */
const labelled = (v: string | undefined) => (v && !/^Q[1-9][0-9]*$/.test(v) ? v : null);

async function main() {
  console.log(
    `Wikidata → people: up to ${LIMIT}, ${BATCH} per query${DRY ? " (dry run)" : ""}`,
  );

  // Most-credited first: those are the pages a visitor is most likely to reach,
  // and the ones the film pages link to most often.
  const people = await prisma.$queryRaw<{ id: string; wikidataId: string; name: string }[]>`
    SELECT p.id, p."wikidataId", p.name
    FROM "Person" p
    WHERE p."wikidataId" IS NOT NULL
      AND p."birthDate" IS NULL
      AND p."wikipediaUrl" IS NULL
      AND cardinality(p.occupations) = 0
    ORDER BY (
      (SELECT count(*) FROM "MovieCast" c WHERE c."personId" = p.id)
      + (SELECT count(*) FROM "MovieCrew" w WHERE w."personId" = p.id)
    ) DESC
    LIMIT ${LIMIT}
  `;

  if (people.length === 0) {
    console.log("Nobody with a Q-id is missing facts. Nothing to do.");
    return;
  }
  console.log(`${people.length} people to fill. First: ${people[0].name}\n`);

  const byQid = new Map(people.map((p) => [p.wikidataId, p]));
  let filled = 0;
  let noFacts = 0;
  const skipped: string[] = [];

  for (let i = 0; i < people.length; i += BATCH) {
    const batch = people.slice(i, i + BATCH);
    let rows: Binding[];
    try {
      rows = await ask(query(batch.map((p) => p.wikidataId)));
    } catch (e) {
      console.warn(`!  batch ${i / BATCH + 1}: ${(e as Error).message}`);
      continue;
    }

    // One person, many rows: an occupation each, and a row per date/article
    // combination. Fold them back together.
    const facts = new Map<string, Facts>();
    for (const b of rows) {
      const qid = b.person?.value.split("/").pop();
      if (!qid || !byQid.has(qid)) continue;
      const entry =
        facts.get(qid) ??
        ({
          birthDate: null,
          deathDate: null,
          birthPlace: null,
          occupations: new Set<string>(),
          wikipediaUrl: null,
        } satisfies Facts);

      entry.birthDate ??= preciseDate(b.birth?.value, b.birthPrecision?.value);
      entry.deathDate ??= preciseDate(b.death?.value, b.deathPrecision?.value);
      entry.birthPlace ??= labelled(b.birthPlaceLabel?.value)?.slice(0, 160) ?? null;
      entry.wikipediaUrl ??= b.article?.value ?? null;
      const occupation = labelled(b.occupationLabel?.value);
      // Five is what the person page shows; the rest is noise on a page about a
      // career ("human", "writer", "artist" all at once).
      if (occupation && entry.occupations.size < 5) entry.occupations.add(occupation);

      facts.set(qid, entry);
    }

    for (const [qid, f] of facts) {
      const person = byQid.get(qid)!;
      const data = {
        birthDate: f.birthDate,
        deathDate: f.deathDate,
        birthPlace: f.birthPlace,
        occupations: [...f.occupations],
        wikipediaUrl: f.wikipediaUrl,
      };
      const anything =
        data.birthDate || data.deathDate || data.birthPlace || data.occupations.length > 0 || data.wikipediaUrl;
      if (!anything) {
        noFacts += 1;
        continue;
      }
      if (DRY) {
        filled += 1;
        continue;
      }
      try {
        await prisma.person.update({ where: { id: person.id }, data });
        filled += 1;
      } catch (e) {
        skipped.push(`${person.name}: ${(e as Error).message.split("\n").pop()}`);
      }
    }

    console.log(
      `batch ${String(i / BATCH + 1).padStart(3)}: ${facts.size}/${batch.length} answered · ${filled} filled so far`,
    );
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(
    `\nFilled ${filled.toLocaleString("en-US")} · nothing on Wikidata for ${noFacts.toLocaleString("en-US")}`,
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
