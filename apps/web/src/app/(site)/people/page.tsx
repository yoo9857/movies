import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { PersonCard } from "@/components/PersonCard";
import { ReelDivider, SectionHead } from "@/components/ReelDivider";
import { peopleBrowseIsIndexable } from "@/lib/browse-index";
import {
  breadcrumbNode,
  type Crumb,
  graph,
  itemListNode,
  pageMetadata,
  peopleEntityId,
  webPageNode,
} from "@/lib/seo";

/**
 * Everyone the library credits.
 *
 * This page used to read every credited person, every one of their credit rows
 * and every review of every film they touched, then group the lot in JavaScript.
 * That was fine for eighty-eight people. The library now fills from Wikidata, and
 * at twelve thousand people the page took 2.4 seconds — five and a half with a
 * role filter on — which is the shape of a query that has no ceiling. Nothing
 * here is unbounded any more:
 *
 *  · the featured strip is computed from the review side, which is small;
 *  · a letter shows at most one screenful, and the letter counts are one
 *    aggregate over one column;
 *  · the per-person numbers are gathered only for the people being rendered.
 *
 * An A–Z index of two hundred thousand names would also be a page nobody can
 * use, so the default view is the people this site has actually written about,
 * with the letters as the way into the rest.
 */

export const dynamic = "force-dynamic";

/** The departments worth offering as filters, in the order a credits roll uses. */
const DEPARTMENTS = [
  "Acting",
  "Director",
  "Screenplay",
  "Writer",
  "Director of Photography",
  "Original Music Composer",
  "Editor",
  "Production Design",
] as const;

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"] as const;

/** How many names one letter shows before asking for a narrower query. */
const PER_LETTER = 240;
const FEATURED = 18;
const WRITTEN_ABOUT = 60;

interface Card {
  slug: string;
  name: string;
  image: string | null;
  tmdbProfilePath: string | null;
  filmCount: number;
  role: string | null;
  reviewCount: number;
  fandomAvg: number | null;
}

interface Row {
  slug: string;
  name: string;
  image: string | null;
  tmdbProfilePath: string | null;
  films: bigint;
  reviews: bigint;
  avg: number | null;
  job: string | null;
}

const toCard = (r: Row): Card => ({
  slug: r.slug,
  name: r.name,
  image: r.image,
  tmdbProfilePath: r.tmdbProfilePath,
  filmCount: Number(r.films),
  reviewCount: Number(r.reviews),
  fandomAvg: r.avg,
  role: r.job,
});

/**
 * The numbers a card shows, for a bounded set of people.
 *
 * One film per person per row even when they are credited twice on it, and one
 * review counted once for the same reason — a writer-director must not have
 * their film's rating counted twice.
 */
const cardSql = (where: string, order: string, limit: number) => `
  WITH picked AS (
    SELECT p.id, p.slug, p.name, p.image, p."tmdbProfilePath"
    FROM "Person" p
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ${limit}
  )
  SELECT k.slug, k.name, k.image, k."tmdbProfilePath",
         COALESCE(f.films, 0) AS films,
         COALESCE(r.reviews, 0) AS reviews,
         r.avg,
         j.job
  FROM picked k
  LEFT JOIN LATERAL (
    SELECT count(*) AS films FROM (
      SELECT "movieId" FROM "MovieCast" WHERE "personId" = k.id
      UNION
      SELECT "movieId" FROM "MovieCrew" WHERE "personId" = k.id
    ) m
  ) f ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS reviews, avg(rating) AS avg FROM (
      SELECT DISTINCT rv.id, rv.rating
      FROM "Review" rv
      WHERE rv.status = 'PUBLISHED'
        AND (rv."movieId" IN (SELECT "movieId" FROM "MovieCast" WHERE "personId" = k.id)
          OR rv."movieId" IN (SELECT "movieId" FROM "MovieCrew" WHERE "personId" = k.id))
    ) d
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT job FROM "MovieCrew" WHERE "personId" = k.id ORDER BY job LIMIT 1
  ) j ON true
`;

const credited = `(EXISTS (SELECT 1 FROM "MovieCast" c WHERE c."personId" = p.id)
                   OR EXISTS (SELECT 1 FROM "MovieCrew" w WHERE w."personId" = p.id))`;

/** `$1` when a specific crew job is bound; the job is always the first parameter. */
const roleFilterFor = (activeRole: string | null) =>
  activeRole
    ? activeRole === "Acting"
      ? `AND EXISTS (SELECT 1 FROM "MovieCast" c WHERE c."personId" = p.id)`
      : `AND EXISTS (SELECT 1 FROM "MovieCrew" w WHERE w."personId" = p.id AND w.job = $1)`
    : "";

/**
 * The card queries, cached for ten minutes per (role, letter) selection.
 *
 * Each card runs three correlated laterals, so a letter page is 240 picked rows
 * and 720 subqueries — correct, bounded, and still the most expensive thing this
 * page does. The result changes when a review publishes or an import lands a new
 * name; neither needs to be visible inside ten minutes. `unstable_cache` keys on
 * the arguments, so every selection caches separately, and the rows are reduced
 * to `Card`s first because the cache round-trips through JSON (a bigint would
 * throw; these become numbers).
 */
const featuredCards = unstable_cache(
  async (activeRole: string | null) => {
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      cardSql(
        `${credited} ${roleFilterFor(activeRole)} AND (
           EXISTS (SELECT 1 FROM "MovieCast" c2 JOIN "Review" r2 ON r2."movieId" = c2."movieId"
                    WHERE c2."personId" = p.id AND r2.status = 'PUBLISHED')
           OR EXISTS (SELECT 1 FROM "MovieCrew" w2 JOIN "Review" r2 ON r2."movieId" = w2."movieId"
                    WHERE w2."personId" = p.id AND r2.status = 'PUBLISHED'))`,
        "p.name ASC",
        FEATURED,
      ),
      ...(activeRole && activeRole !== "Acting" ? [activeRole] : []),
    );
    return rows.map(toCard);
  },
  ["people-featured"],
  { revalidate: 600 },
);

const listedCards = unstable_cache(
  async (activeRole: string | null, activeLetter: string | null) => {
    const params: string[] = activeRole && activeRole !== "Acting" ? [activeRole] : [];
    let where: string;
    if (activeLetter === "#") {
      where = `${credited} ${roleFilterFor(activeRole)} AND upper(left(p.name, 1)) !~ '^[A-Z]$'`;
    } else if (activeLetter) {
      params.push(activeLetter);
      where = `${credited} ${roleFilterFor(activeRole)} AND upper(left(p.name, 1)) = $${params.length}`;
    } else {
      // Without a letter, the people this site has written about — a list with
      // something on it rather than the first 240 names in the alphabet.
      where = `${credited} ${roleFilterFor(activeRole)} AND (p.bio IS NOT NULL OR p.notes IS NOT NULL OR p.image IS NOT NULL)`;
    }
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      cardSql(where, "p.name ASC", activeLetter ? PER_LETTER : WRITTEN_ABOUT),
      ...params,
    );
    return rows.map(toCard);
  },
  ["people-listed"],
  { revalidate: 600 },
);

/**
 * The letter bar's counts and the page's total — one aggregate over one column,
 * but over two hundred thousand rows of it, for numbers that drift only as
 * imports land. An hour stale is still honest.
 */
const letterTally = unstable_cache(
  async () => {
    const [rows, total] = await Promise.all([
      prisma.$queryRaw<{ initial: string; people: bigint }[]>`
        SELECT CASE WHEN upper(left(name, 1)) ~ '^[A-Z]$' THEN upper(left(name, 1)) ELSE '#' END AS initial,
               count(*) AS people
        FROM "Person"
        GROUP BY 1
      `,
      prisma.person.count(),
    ]);
    return {
      letters: rows.map((r) => [r.initial, Number(r.people)] as [string, number]),
      total,
    };
  },
  ["people-letter-tally"],
  { revalidate: 3600 },
);

export async function generateMetadata(props: {
  searchParams: Promise<{ role?: string; letter?: string }>;
}): Promise<Metadata> {
  const { role, letter } = await props.searchParams;
  const active = DEPARTMENTS.find((d) => d === role);
  const initial = LETTERS.find((l) => l === letter?.toUpperCase());

  // One canonical per selection that changes *which* people are listed, and the
  // letter is one of those — the same rule the film library follows.
  const params = new URLSearchParams();
  if (active) params.set("role", active);
  if (initial) params.set("letter", initial);
  const query = params.toString();

  const scope = active ? (active === "Acting" ? "Actors" : `${active}s`) : "People";
  return pageMetadata({
    path: query ? `/people?${query}` : "/people",
    // Only `/people` itself is a destination — the one URL the sitemap
    // announces. A role or an initial keeps its own canonical and stays
    // walkable; see `lib/browse-index.ts` for why it is not offered.
    noIndex: !peopleBrowseIsIndexable(active ?? null, initial ?? null),
    title: initial ? `${scope} — ${initial}` : scope,
    description: active
      ? `Everyone credited as ${active} in the CinePixo library, with the reviews written here about their work.`
      : "Actors, directors and crew in the CinePixo library — each with their filmography and every review written here about their work.",
    keywords: ["film directors", "actors", "film crew", "film criticism"],
  });
}

export default async function PeoplePage(props: {
  searchParams: Promise<{ role?: string; letter?: string }>;
}) {
  const { role, letter } = await props.searchParams;
  const activeRole = DEPARTMENTS.find((d) => d === role) ?? null;
  const activeLetter = LETTERS.find((l) => l === letter?.toUpperCase()) ?? null;

  const [featured, listed, tally] = await Promise.all([
    // Most written about: driven from the review side, which is small — and
    // cached, like everything below, because none of it changes by the minute.
    featuredCards(activeRole),
    listedCards(activeRole, activeLetter),
    letterTally(),
  ]);

  const total = tally.total;
  const counts = new Map(tally.letters);

  const params = new URLSearchParams();
  if (activeRole) params.set("role", activeRole);
  if (activeLetter) params.set("letter", activeLetter);
  const path = params.toString() ? `/people?${params.toString()}` : "/people";
  const trail: Crumb[] = [{ name: "People" }];

  const href = (patch: { role?: string | null; letter?: string | null }) => {
    const next = new URLSearchParams();
    const nextRole = patch.role === undefined ? activeRole : patch.role;
    const nextLetter = patch.letter === undefined ? activeLetter : patch.letter;
    if (nextRole) next.set("role", nextRole);
    if (nextLetter) next.set("letter", nextLetter);
    return next.toString() ? `/people?${next.toString()}` : "/people";
  };

  const jsonLd = graph(
    webPageNode({
      path,
      kind: "CollectionPage",
      name: activeRole ?? "People",
      description: "Everyone in the CinePixo library, with the criticism on their work.",
      hasBreadcrumb: true,
    }),
    breadcrumbNode(path, trail),
    // The list describes what this page renders, which is the strip — not the
    // whole library. Claiming a total of two hundred thousand for eighteen
    // rendered cards would be a number with nothing behind it.
    featured.length > 0 &&
      itemListNode({
        path,
        name: activeRole ?? "People",
        entries: featured.map((p) => ({
          path: `/people/${p.slug}`,
          name: p.name,
          entityId: peopleEntityId(p.slug),
        })),
      }),
  );

  const chip = "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors whitespace-nowrap";
  const chipOff = "border-line text-muted hover:border-accent-dim hover:text-foreground";
  const chipOn = "border-accent bg-accent text-black font-semibold";

  return (
    <div>
      <JsonLd data={jsonLd} />
      <Breadcrumbs trail={trail} />

      <h1 className="mt-4 text-3xl font-bold tracking-tight">People</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Everyone the library credits — and, on each page, every review written here about their
        work.
      </p>

      {/* Department chips: same selection surface as the film library. */}
      <div className="mt-6 space-y-3 border-y border-line py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-xs text-muted">
            {total.toLocaleString("en-US")} {total === 1 ? "person" : "people"} credited
          </span>
          {(activeRole || activeLetter) && (
            <Link
              href="/people"
              className="ml-auto text-xs text-muted underline underline-offset-2 hover:text-foreground"
            >
              Clear filters
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Role</span>
          <div className="cx-rail flex gap-1.5 pb-1">
            <Link
              href={href({ role: null })}
              aria-current={!activeRole ? "true" : undefined}
              className={`${chip} ${!activeRole ? chipOn : chipOff}`}
            >
              Everyone
            </Link>
            {DEPARTMENTS.map((d) => {
              const on = d === activeRole;
              return (
                <Link
                  key={d}
                  href={href({ role: on ? null : d })}
                  aria-current={on ? "true" : undefined}
                  className={`${chip} ${on ? chipOn : chipOff}`}
                >
                  {d === "Acting" ? "Actors" : d}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {featured.length > 0 && (
        <section className="mt-9">
          <SectionHead
            action={
              <span className="hidden font-mono text-[10px] text-muted sm:inline">
                whose work has been reviewed here
              </span>
            }
          >
            {activeRole ? (activeRole === "Acting" ? "Actors" : activeRole) : "Written about"}
          </SectionHead>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {featured.map((p) => (
              <PersonCard key={p.slug} person={p} />
            ))}
          </div>
        </section>
      )}

      <ReelDivider className="my-10" />

      <section>
        <SectionHead
          action={
            <span className="hidden font-mono text-[10px] text-muted sm:inline">
              {activeLetter ? `${(counts.get(activeLetter) ?? 0).toLocaleString("en-US")} under ${activeLetter}` : "pick a letter"}
            </span>
          }
        >
          Browse by name
        </SectionHead>

        <div className="cx-rail mt-3 flex gap-1 pb-1">
          {LETTERS.map((initial) => {
            const on = initial === activeLetter;
            const n = counts.get(initial) ?? 0;
            return (
              <Link
                key={initial}
                href={href({ letter: on ? null : initial })}
                aria-current={on ? "true" : undefined}
                title={`${n.toLocaleString("en-US")} people`}
                className={`shrink-0 rounded border px-2 py-0.5 font-mono text-xs transition-colors ${
                  on
                    ? "border-accent bg-accent font-semibold text-black"
                    : n === 0
                      ? "border-line/50 text-muted/40"
                      : "border-line text-muted hover:border-accent-dim hover:text-accent"
                }`}
              >
                {initial}
              </Link>
            );
          })}
        </div>

        {listed.length === 0 ? (
          <p className="mt-5 text-muted">
            {activeLetter
              ? `Nobody under ${activeLetter}${activeRole ? ` in ${activeRole}` : ""}.`
              : "Nothing written about anyone here yet — pick a letter to browse the credits."}
          </p>
        ) : (
          <>
            {!activeLetter && (
              <p className="mt-4 text-sm text-muted">
                People this site has written about or photographed. Everyone else is a letter away.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {listed.map((p) => (
                <Link
                  key={p.slug}
                  href={`/people/${p.slug}`}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted transition-colors hover:border-accent-dim hover:text-foreground"
                >
                  {p.name}
                  <span className="ml-1.5 font-mono text-[10px] text-muted/70">{p.filmCount}</span>
                </Link>
              ))}
            </div>
            {activeLetter && (counts.get(activeLetter) ?? 0) > PER_LETTER && (
              <p className="mt-4 text-xs text-muted">
                Showing the first {PER_LETTER.toLocaleString("en-US")} of{" "}
                {(counts.get(activeLetter) ?? 0).toLocaleString("en-US")} under {activeLetter}. Use{" "}
                <Link href="/search" className="text-accent hover:opacity-80">
                  search
                </Link>{" "}
                for a name.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
