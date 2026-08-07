// Import a small, editorially chosen set of recent films from Wikipedia and
// Wikidata. This complements the year-wide SPARQL importer: a public query can
// time out on a whole release year, while these exact article identities remain
// cheap, deterministic and reviewable.
//
//   npm run db:import-curated
//   npm run db:import-curated -- --dry
import "./env";
import { movieSlug } from "../../shared/src/index";
import { prisma } from "../src/index";

const WIKI_LICENSE = "CC BY-SA 4.0";
const USER_AGENT = "CinePixo/0.1 (https://cinepixo.com; devoh@signpost.kr) node-fetch";
const DRY = process.argv.includes("--dry");

// 2024 and 2025 Best Picture nominees, plus both years' Animated Feature
// nominees. Existing films are skipped by QID, so overlap is intentional.
const ARTICLE_TITLES = [
  "Marty_Supreme",
  "One_Battle_After_Another",
  "The_Secret_Agent_(2025_film)",
  "Sentimental_Value",
  "Train_Dreams_(film)",
  "Anora",
  "The_Brutalist",
  "A_Complete_Unknown",
  "Conclave_(film)",
  "Dune:_Part_Two",
  "Emilia_Pérez",
  "I'm_Still_Here_(2024_film)",
  "Nickel_Boys",
  "The_Substance",
  "Wicked_(2024_film)",
  "Flow_(2024_film)",
  "Inside_Out_2",
  "Memoir_of_a_Snail",
  "Wallace_&_Gromit:_Vengeance_Most_Fowl",
  "The_Wild_Robot",
  "Arco_(film)",
  "Elio_(film)",
  "Little_Amélie_or_the_Character_of_Rain",
  "Zootopia_2",
] as const;

interface Summary {
  title: string;
  extract?: string;
  wikibase_item?: string;
  content_urls?: { desktop?: { page?: string } };
}

interface Snak {
  mainsnak?: { datavalue?: { value?: unknown } };
  rank?: string;
}

interface Entity {
  labels?: Record<string, { value: string }>;
  claims?: Record<string, Snak[]>;
  sitelinks?: Record<string, unknown>;
}

interface EntityResponse {
  entities: Record<string, Entity>;
}

async function fetchJson<T>(url: string, attempt = 1): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 3_000));
    return fetchJson<T>(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

const valueOf = (entity: Entity, property: string): unknown[] =>
  (entity.claims?.[property] ?? [])
    .filter((claim) => claim.rank !== "deprecated")
    .map((claim) => claim.mainsnak?.datavalue?.value)
    .filter((value) => value !== undefined);

const itemIds = (entity: Entity, property: string): string[] =>
  valueOf(entity, property)
    .map((value) => (value as { id?: string })?.id)
    .filter((id): id is string => !!id && /^Q[1-9][0-9]*$/.test(id));

function firstString(entity: Entity, property: string): string | null {
  const value = valueOf(entity, property)[0];
  return typeof value === "string" ? value : null;
}

function originalTitle(entity: Entity): string | null {
  const value = valueOf(entity, "P1476")[0] as { text?: string } | undefined;
  return value?.text?.trim() || null;
}

function releaseDate(entity: Entity): Date | null {
  const dates = valueOf(entity, "P577")
    .map((value) => (value as { time?: string })?.time)
    .filter((time): time is string => !!time && /^\+\d{4}-\d{2}-\d{2}T/.test(time))
    .map((time) => new Date(time.slice(1)))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  return dates[0] ?? null;
}

function runtime(entity: Entity): number | null {
  const value = valueOf(entity, "P2047")[0] as { amount?: string; unit?: string } | undefined;
  const amount = Number(value?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = value?.unit?.split("/").pop();
  const minutes = unit === "Q11574" ? amount / 60 : unit === "Q25235" ? amount * 60 : amount;
  return Math.round(minutes);
}

const GENRE_ALIASES: [RegExp, string][] = [
  [/animation|animated|anime/i, "Animation"],
  [/science fiction|sci-fi/i, "Science Fiction"],
  [/documentary/i, "Documentary"],
  [/horror|slasher/i, "Horror"],
  [/thriller|suspense/i, "Thriller"],
  [/comedy|satire/i, "Comedy"],
  [/drama|melodrama/i, "Drama"],
  [/musical|music/i, "Music"],
  [/romance|romantic/i, "Romance"],
  [/fantasy/i, "Fantasy"],
  [/adventure|epic/i, "Adventure"],
  [/action|martial arts|superhero/i, "Action"],
  [/crime|gangster|film noir/i, "Crime"],
  [/mystery|detective/i, "Mystery"],
  [/historical|history|biographical/i, "History"],
  [/family|children/i, "Family"],
  [/war/i, "War"],
  [/western/i, "Western"],
];

const GENRE_OVERRIDES: Record<string, string[]> = {
  // Wikidata currently describes this with a compound item whose English label
  // does not pass through the canonical aliases above.
  Q132862555: ["Animation", "Fantasy", "Drama"],
};

function canonicalGenres(labels: string[]): string[] {
  const genres = new Set<string>();
  for (const label of labels) {
    for (const [pattern, canonical] of GENRE_ALIASES) {
      if (pattern.test(label)) genres.add(canonical);
    }
  }
  return [...genres].slice(0, 6);
}

async function labelsFor(ids: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    if (batch.length === 0) continue;
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.search = new URLSearchParams({
      action: "wbgetentities",
      ids: batch.join("|"),
      props: "labels",
      languages: "en",
      format: "json",
      origin: "*",
    }).toString();
    const data = await fetchJson<EntityResponse>(url.toString());
    for (const [id, entity] of Object.entries(data.entities)) {
      const label = entity.labels?.en?.value;
      if (label) labels.set(id, label);
    }
  }
  return labels;
}

async function summaries(): Promise<Summary[]> {
  const result: Summary[] = [];
  for (const title of ARTICLE_TITLES) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summary = await fetchJson<Summary>(url);
    if (!summary.wikibase_item || !/^Q[1-9][0-9]*$/.test(summary.wikibase_item)) {
      throw new Error(`${title}: Wikipedia returned no Wikidata identity`);
    }
    result.push(summary);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return result;
}

async function entitiesFor(qids: string[]): Promise<Record<string, Entity>> {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({
    action: "wbgetentities",
    ids: qids.join("|"),
    props: "claims|labels|sitelinks",
    languages: "en",
    format: "json",
    origin: "*",
  }).toString();
  return (await fetchJson<EntityResponse>(url.toString())).entities;
}

async function mintSlug(title: string, date: Date | null): Promise<string> {
  const base = movieSlug(title, date);
  let slug = base;
  for (let suffix = 2; await prisma.movie.findUnique({ where: { slug } }); suffix += 1) {
    slug = `${base}-${suffix}`;
  }
  return slug;
}

async function main() {
  console.log(`Curated Wikipedia → library: ${ARTICLE_TITLES.length} articles${DRY ? " (dry run)" : ""}`);
  const pages = await summaries();
  const qids = pages.map((page) => page.wikibase_item!);
  const entities = await entitiesFor(qids);

  const relatedIds = new Set<string>();
  for (const qid of qids) {
    const entity = entities[qid];
    for (const property of ["P31", "P57", "P136", "P495", "P364"]) {
      for (const id of itemIds(entity, property)) relatedIds.add(id);
    }
  }
  const labels = await labelsFor([...relatedIds]);
  const names = (entity: Entity, property: string) =>
    itemIds(entity, property).map((id) => labels.get(id)).filter((name): name is string => !!name);

  let inserted = 0;
  let skipped = 0;
  const importedQids: string[] = [];

  for (const page of pages) {
    const qid = page.wikibase_item!;
    const entity = entities[qid];
    if (!entity) throw new Error(`${qid}: Wikidata returned no entity`);
    const inferredGenres = GENRE_OVERRIDES[qid] ??
      canonicalGenres([...names(entity, "P31"), ...names(entity, "P136")]);
    const existing = await prisma.movie.findUnique({ where: { wikidataId: qid } });
    if (existing) {
      const genres = [...new Set([...existing.genres, ...inferredGenres])];
      if (!DRY && genres.length > existing.genres.length) {
        await prisma.movie.update({ where: { id: existing.id }, data: { genres } });
        console.log(`~ ${page.title} filled genre mapping`);
      } else {
        console.log(`= ${page.title} already exists`);
      }
      skipped += 1;
      continue;
    }

    const date = releaseDate(entity);
    const directors = names(entity, "P57");
    const genres = inferredGenres;
    const countries = names(entity, "P495");
    const languages = names(entity, "P364");
    const articleUrl = page.content_urls?.desktop?.page ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`;
    const overview = page.extract?.trim().slice(0, 1200) || null;
    const title = entity.labels?.en?.value?.trim() || page.title;

    if (DRY) {
      console.log(`+ ${title} (${date?.getUTCFullYear() ?? "—"}) · ${qid}`);
      importedQids.push(qid);
      continue;
    }

    await prisma.movie.create({
      data: {
        slug: await mintSlug(title, date),
        wikidataId: qid,
        wikidataSitelinks: Object.keys(entity.sitelinks ?? {}).length,
        imdbId: firstString(entity, "P345"),
        title,
        originalTitle: originalTitle(entity),
        overview,
        overviewSourceUrl: overview ? articleUrl : null,
        overviewLicense: overview ? WIKI_LICENSE : null,
        wikipediaUrl: articleUrl,
        originalLanguage: languages.slice(0, 3).join(", ") || null,
        releaseDate: date,
        runtime: runtime(entity),
        director: directors.join(", ") || null,
        genres,
        keywords: [],
        countries,
      },
    });
    inserted += 1;
    importedQids.push(qid);
    console.log(`+ ${title} (${date?.getUTCFullYear() ?? "—"}) · ${qid}`);
  }

  console.log(`Inserted ${inserted}; already present ${skipped}; library ${await prisma.movie.count()}.`);
  console.log(`QIDs: ${importedQids.join(",")}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
