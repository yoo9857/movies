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

/** The names Search Console showed impressions for, whose pages are noindex. */
const DEMAND = [
  "augusto-genina",
  "olga-limburg",
  "henri-alekan",
  "yevgeny-morgunov",
  "gertrud-wolle",
  "jose-riesgo",
  "nick-castle",
  "hong-kyung-pyo",
];

/** Below this many films in the library there is nothing honest to summarise. */
const MIN_FILMS = 3;

/**
 * A second job is only worth naming if they hold it more than once.
 *
 * Henri Alekan has fifty-two photography credits here and exactly one as an
 * actor — a documentary appearance, almost certainly. Publishing "credited here
 * also as an actor" on a cinematographer's page is technically supported by our
 * rows and still the wrong sentence.
 */
const MIN_SECONDARY_CREDITS = 2;

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
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1994, 1997 and 2003" — a list a reader can read aloud. */
function readableList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function compose(name: string, credits: Credit[]): string | null {
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
    .filter(([job, n]) => job !== topJob && n >= MIN_SECONDARY_CREDITS && ROLE_NOUN[job])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([job]) => ROLE_NOUN[job] as string);
  if (others.length > 0) {
    sentences.push(`Credited here also as ${readableList(others)}.`);
  }

  const reviewed = credits.filter((c) => c.reviewed);
  if (reviewed.length > 0) {
    const titles = [...new Set(reviewed.map((c) => c.title))].slice(0, 3);
    sentences.push(
      `${reviewed.length === 1 ? "One of those films has" : `${titles.length} of those films have`} been reviewed here: ${readableList(titles)}.`,
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
            reviews: { where: { status: "PUBLISHED" }, select: { id: true } },
          },
        },
      },
    }),
  ]);

  const row = (
    movieId: string,
    m: { title: string; releaseDate: Date | null; reviews: { id: string }[] },
    job: string,
  ): Credit => ({
    movieId,
    title: m.title,
    year: m.releaseDate ? new Date(m.releaseDate).getUTCFullYear() : null,
    job,
    reviewed: m.reviews.length > 0,
  });

  return [
    ...cast.map((c) => row(c.movieId, c.movie, "Actor")),
    ...crew.map((c) => row(c.movieId, c.movie, c.job)),
  ];
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
    const note = compose(p.name, await creditsFor(p.id));
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
