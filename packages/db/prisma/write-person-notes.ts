// Career notes for a person, composed from our own credit graph.
//
//   npm run db:person-notes -- --dry --slug=henri-alekan
//   npm run db:person-notes -- --dry --demand         # the Search Console names
//   npm run db:person-notes -- --slug=henri-alekan    # writes it
//
// `Person.notes` is described in the schema as "career notes, recurring
// collaborators, what to watch first" and sits under the line that reads
// "everything below is ours to write". Filling it also opens the page: the
// indexability rule is `bio || notes || a reviewed film`, so a note is the
// difference between a person page being offered as a destination and being
// crawled past.
//
// That is a reason to be careful rather than prolific.
//
//  · **Every clause is derived, not recalled.** The sentences below are assembled
//    from rows this database holds — how many films of theirs are in the library,
//    which job they hold most, who they work with repeatedly, which of their films
//    has been reviewed here. Nothing is written from a model's memory of a real
//    person, which is how a reference page acquires a confident falsehood.
//  · **It refuses to write a note it cannot support.** Under three films, or no
//    identifiable job, and the person is skipped — a note that says "appears in
//    two films" is not career notes, it is padding, and padding at scale is the
//    thing Google's scaled-content policy is about.
//  · **Fill-only.** A person who already has notes is never touched, so nothing
//    hand-written is ever overwritten.
import "./env";
import { prisma } from "../src/index";

const args = process.argv.slice(2);
const has = (n: string) => args.includes(`--${n}`);
const val = (n: string) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};

const DRY = has("dry");
const SLUG = val("slug");
const LIMIT = Number(val("limit") ?? 25);

/**
 * The names Search Console showed impressions for, whose pages had nothing on
 * them. Append rather than replace: the list is a record of demand we have seen,
 * and `--demand` only touches rows where `notes` is still null, so a name that
 * has already been filled costs nothing by staying here.
 *
 * The 2026-08-20 report is the clearest version of the problem this file exists
 * for. Almost every impression the site earns lands on an imported person page,
 * at a position that would be worth having, with no clicks at all:
 *
 *   135 impressions  pos 5.3   a question about Olga Limburg
 *    80 impressions  pos 5-9   three separate queries for Josephine Lovett's
 *                              birth and death dates, and where she died
 *    83 impressions  pos 9.6   "destin daniel cretton age"
 *    38 impressions  pos 27    "rakesh roshan"
 *    23 impressions  pos 10.3  "r. d. rajasekhar movies"
 *    21 impressions  pos 36.8  "christian bale"
 *
 * Position five with zero clicks is a page that ranked and then had nothing to
 * say.
 */
const DEMAND = [
  // Seen in the earlier report.
  "augusto-genina",
  "olga-limburg",
  "henri-alekan",
  "yevgeny-morgunov",
  "gertrud-wolle",
  "jose-riesgo",
  "nick-castle",
  "hong-kyung-pyo",
  // Added from the 2026-08-20 report.
  "josephine-lovett",
  "r-d-rajasekhar",
  "rakesh-roshan",
  "destin-daniel-cretton",
  "christian-bale",
];

/** Below this many films in the library there is nothing honest to summarise. */
const MIN_FILMS = 3;

/**
 * A second job is worth naming when it is a real share of their work here, not a
 * footnote to it.
 *
 * Henri Alekan has fifty photography credits and three cast credits — one of them
 * appearing as himself in a Wenders film. "Credited here also as an actor" is
 * supported by those rows and is still the wrong sentence about a cinematographer.
 *
 * Proportion, not a flat count, and not the presence of a character name: only
 * 8.6% of cast rows in this database carry one, and José Riesgo — sixty-eight
 * roles — has none. Character names would have stripped the acting off actual
 * actors, which is why this was measured before it was written.
 */
const MIN_SECONDARY_CREDITS = 2;
const MIN_SECONDARY_SHARE = 0.15;

/**
 * Our six crew labels as role nouns.
 *
 * `MovieCrew.job` holds credit labels, not job titles: "Screenplay" is what a
 * title card says, "a screenwriter" is what a person is. Mirrors the mapping in
 * apps/web/src/lib/person-roles.ts, which cannot be imported across the package
 * boundary — if a seventh credit label ever appears, both need the new entry.
 */
const ROLE_NOUN: Record<string, string> = {
  Actor: "an actor",
  Director: "a director",
  Screenplay: "a screenwriter",
  "Director of Photography": "a cinematographer",
  Editor: "an editor",
  "Original Music Composer": "a composer",
  Producer: "a producer",
};

interface Credit {
  movieId: string;
  title: string;
  year: number | null;
  job: string;
  reviewed: boolean;
  /** Wikidata sitelink count — how widely the film is written about. */
  fame: number | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1994, 1997 and 2003" — a list a reader can read aloud. */
function readableList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The entry point: which of their films to watch first.
 *
 * Prefers one we have reviewed — then the note points at our own writing — and
 * otherwise the most widely documented, which is what `wikidataSitelinks`
 * measures. This is the one clause not already visible elsewhere on the page: the
 * filmography lists everything in release order and says nothing about where to
 * start.
 */
function entryPoint(credits: Credit[]): Credit | null {
  const reviewed = credits.filter((c) => c.reviewed);
  const pool = reviewed.length > 0 ? reviewed : credits;
  return (
    [...pool].filter((c) => c.fame !== null).sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0))[0] ?? null
  );
}

function compose(
  name: string,
  credits: Credit[],
  collaborator: { name: string; shared: number } | null,
): string | null {
  const films = new Set(credits.map((c) => c.movieId));
  if (films.size < MIN_FILMS) return null;

  // The job they hold most often, from our credits rather than from Wikidata's
  // unordered occupation list.
  const jobCount = new Map<string, number>();
  for (const c of credits) jobCount.set(c.job, (jobCount.get(c.job) ?? 0) + 1);
  const [topJob] = [...jobCount.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!topJob) return null;

  const role =
    topJob === "Actor"
      ? "appears in"
      : topJob === "Director"
        ? "directed"
        : topJob === "Director of Photography"
          ? "photographed"
          : topJob === "Screenplay"
            ? "wrote"
            : topJob === "Editor"
              ? "cut"
              : topJob === "Original Music Composer"
                ? "scored"
                : "worked on";

  const years = credits.map((c) => c.year).filter((y): y is number => y !== null);
  const span =
    years.length > 1 && Math.min(...years) !== Math.max(...years)
      ? ` between ${Math.min(...years)} and ${Math.max(...years)}`
      : years.length === 1
        ? ` in ${years[0]}`
        : "";

  const sentences: string[] = [
    `${name} ${role} ${plural(films.size, "film")} in the CinePixo library${span}.`,
  ];

  // A second job worth naming: held more than once, and named as a role rather
  // than as the credit label a title card would print.
  const others = [...jobCount.entries()]
    .filter(
      ([job, n]) =>
        job !== topJob &&
        n >= MIN_SECONDARY_CREDITS &&
        n / credits.length >= MIN_SECONDARY_SHARE &&
        ROLE_NOUN[job],
    )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([job]) => ROLE_NOUN[job] as string);
  if (others.length > 0) {
    sentences.push(`Credited here also as ${readableList(others)}.`);
  }

  // The two clauses the field was named for, and the two a reader cannot get by
  // reading the rest of the page: who they keep working with, and where to start.
  if (collaborator && collaborator.shared >= 2) {
    sentences.push(
      `Works most often with ${collaborator.name} — ${plural(collaborator.shared, "film")} together here.`,
    );
  }

  const start = entryPoint(credits);
  if (start) {
    sentences.push(
      `Start with ${start.title}${start.year ? ` (${start.year})` : ""}${start.reviewed ? ", reviewed here" : ""}.`,
    );
  }

  return sentences.join(" ");
}

async function creditsFor(personId: string): Promise<Credit[]> {
  const [cast, crew] = await Promise.all([
    prisma.movieCast.findMany({
      where: { personId },
      select: {
        movieId: true,
        movie: {
          select: {
            title: true,
            releaseDate: true,
            wikidataSitelinks: true,
            reviews: { where: { status: "PUBLISHED" }, select: { id: true } },
          },
        },
      },
    }),
    prisma.movieCrew.findMany({
      where: { personId },
      select: {
        movieId: true,
        job: true,
        movie: {
          select: {
            title: true,
            releaseDate: true,
            wikidataSitelinks: true,
            reviews: { where: { status: "PUBLISHED" }, select: { id: true } },
          },
        },
      },
    }),
  ]);

  const row = (
    movieId: string,
    m: {
      title: string;
      releaseDate: Date | null;
      wikidataSitelinks: number | null;
      reviews: { id: string }[];
    },
    job: string,
  ): Credit => ({
    movieId,
    title: m.title,
    year: m.releaseDate ? new Date(m.releaseDate).getUTCFullYear() : null,
    job,
    reviewed: m.reviews.length > 0,
    fame: m.wikidataSitelinks,
  });

  return [
    ...cast.map((c) => row(c.movieId, c.movie, "Actor")),
    ...crew.map((c) => row(c.movieId, c.movie, c.job)),
  ];
}

/**
 * Who they work with most, over the films we hold.
 *
 * Counted over shared *films* rather than shared credits, so a person credited
 * twice on one picture is one collaboration. Two films is the floor: on a library
 * this size one shared film is a coincidence — the same rule the person page's own
 * Collaborators section applies.
 */
async function topCollaborator(
  personId: string,
  movieIds: string[],
): Promise<{ name: string; shared: number } | null> {
  if (movieIds.length < 2) return null;

  const [cast, crew] = await Promise.all([
    prisma.movieCast.findMany({
      where: { movieId: { in: movieIds }, personId: { not: null, notIn: [personId] } },
      select: { movieId: true, person: { select: { name: true } } },
    }),
    prisma.movieCrew.findMany({
      where: { movieId: { in: movieIds }, personId: { not: null, notIn: [personId] } },
      select: { movieId: true, person: { select: { name: true } } },
    }),
  ]);

  const films = new Map<string, Set<string>>();
  for (const r of [...cast, ...crew]) {
    const name = r.person?.name;
    if (!name) continue;
    const set = films.get(name) ?? new Set<string>();
    set.add(r.movieId);
    films.set(name, set);
  }

  const best = [...films.entries()]
    .map(([name, set]) => ({ name, shared: set.size }))
    .sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name))[0];
  return best && best.shared >= 2 ? best : null;
}

async function main() {
  const where = SLUG
    ? { slug: SLUG }
    : has("demand")
      ? { slug: { in: DEMAND }, notes: null }
      : { notes: null, bio: null };

  const people = await prisma.person.findMany({
    where,
    take: SLUG ? 1 : LIMIT,
    select: { id: true, slug: true, name: true, notes: true },
  });

  if (people.length === 0) {
    console.log("nobody matched (already has notes?)");
    return;
  }

  let written = 0;
  let skipped = 0;

  for (const p of people) {
    if (p.notes) {
      console.log(`- ${p.slug}: already has notes, untouched`);
      skipped++;
      continue;
    }
    const credits = await creditsFor(p.id);
    const collaborator = await topCollaborator(p.id, [
      ...new Set(credits.map((c) => c.movieId)),
    ]);
    const note = compose(p.name, credits, collaborator);
    if (!note) {
      console.log(`- ${p.slug}: too little to say honestly, skipped`);
      skipped++;
      continue;
    }
    console.log(`\n${p.slug}`);
    console.log(`  ${note}`);
    if (!DRY) {
      await prisma.person.updateMany({ where: { id: p.id, notes: null }, data: { notes: note } });
      written++;
    }
  }

  console.log(`\n${DRY ? "[dry] would write" : "wrote"}=${DRY ? people.length - skipped : written} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
