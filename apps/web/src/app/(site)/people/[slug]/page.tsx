import { prisma } from "@cinepixo/db";
import { toStarScale } from "@cinepixo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { PersonPortrait } from "@/components/PersonPortrait";
import { Poster } from "@/components/Poster";
import { ReelDivider } from "@/components/ReelDivider";
import { ReviewIndex } from "@/components/ReviewIndex";
import { Collaborators, type Collaborator } from "@/components/person/Collaborators";
import { PersonStats, type RatedFilm } from "@/components/person/PersonStats";
import {
  absUrl,
  breadcrumbNode,
  type Crumb,
  graph,
  isoDay,
  itemListNode,
  movieEntityId,
  pageMetadata,
  peopleEntityId,
  webPageNode,
} from "@/lib/seo";

/**
 * A person, as a reference page.
 *
 * The layout answers questions in the order they get asked. Who is this, and
 * what do they do — the hero. What are the facts — the panel beside it, where a
 * reader scans rather than reads. What does this site think — our notes and the
 * ratings, which is the half no encyclopedia has. What have they made — the
 * filmography, as a table with a score per row rather than a rail of posters,
 * because a poster tells you nothing you did not already know from the title.
 * Who do they work with — computed from the credit graph. And then the sources,
 * because a page that states facts without saying where they came from is not a
 * reference, it is an assertion.
 *
 * Two columns on desktop: the argument in the wide one, the lookup material in
 * the narrow one. One column on a phone, facts first, because that is what
 * someone arriving from a search result wants.
 */

export const dynamic = "force-dynamic";

const movieSelect = {
  id: true,
  slug: true,
  title: true,
  posterPath: true,
  releaseDate: true,
  reviews: {
    where: { status: "PUBLISHED" as const },
    select: { rating: true },
  },
};

const include = {
  castRoles: { include: { movie: { select: movieSelect } } },
  crewRoles: { include: { movie: { select: movieSelect } } },
};

const getPerson = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,130}$/i.test(slug)) return null;
  return prisma.person.findUnique({ where: { slug }, include });
});

/** Reviews of anything they worked on — the criticism on them. */
const getCriticism = cache(async (movieIds: string[]) => {
  if (movieIds.length === 0) return [];
  return prisma.review.findMany({
    where: { status: "PUBLISHED", movieId: { in: movieIds } },
    orderBy: { publishedAt: "desc" },
    take: 24,
    select: {
      slug: true,
      title: true,
      rating: true,
      publishedAt: true,
      author: { select: { username: true, displayName: true } },
      movie: { select: { title: true } },
    },
  });
});

/**
 * Everyone else credited on the same films, ranked by how many they share.
 *
 * Aggregated here rather than in SQL: the library is small enough that one query
 * plus a map is cheaper than a raw grouped join, and it keeps the ranking rule
 * readable.
 */
const getCollaborators = cache(async (movieIds: string[], selfId: string) => {
  if (movieIds.length === 0) return [];

  const [cast, crew] = await Promise.all([
    prisma.movieCast.findMany({
      where: { movieId: { in: movieIds }, personId: { not: null, notIn: [selfId] } },
      select: {
        movieId: true,
        person: { select: { slug: true, name: true, image: true, tmdbProfilePath: true } },
        movie: { select: { title: true } },
      },
    }),
    prisma.movieCrew.findMany({
      where: { movieId: { in: movieIds }, personId: { not: null, notIn: [selfId] } },
      select: {
        movieId: true,
        job: true,
        person: { select: { slug: true, name: true, image: true, tmdbProfilePath: true } },
        movie: { select: { title: true } },
      },
    }),
  ]);

  const acc = new Map<
    string,
    Collaborator & { films: Set<string>; roleCounts: Map<string, number> }
  >();

  const add = (
    person: { slug: string; name: string; image: string | null; tmdbProfilePath: string | null },
    movieId: string,
    title: string,
    role: string,
  ) => {
    const entry =
      acc.get(person.slug) ??
      {
        ...person,
        role: null,
        sharedFilms: 0,
        titles: [] as string[],
        films: new Set<string>(),
        roleCounts: new Map<string, number>(),
      };
    if (!entry.films.has(movieId)) {
      entry.films.add(movieId);
      entry.titles.push(title);
    }
    entry.roleCounts.set(role, (entry.roleCounts.get(role) ?? 0) + 1);
    acc.set(person.slug, entry);
  };

  for (const c of cast) {
    if (c.person) add(c.person, c.movieId, c.movie.title, "Actor");
  }
  for (const c of crew) {
    if (c.person) add(c.person, c.movieId, c.movie.title, c.job);
  }

  return [...acc.values()]
    // One shared film is a coincidence on a library this size; two is a habit.
    .filter((c) => c.films.size > 1)
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      image: c.image,
      tmdbProfilePath: c.tmdbProfilePath,
      role: [...c.roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      sharedFilms: c.films.size,
      titles: c.titles,
    }))
    .sort((a, b) => b.sharedFilms - a.sharedFilms || a.name.localeCompare(b.name))
    .slice(0, 10);
});

const yearOf = (d: Date | null) => (d ? new Date(d).getUTCFullYear() : null);

function ageFrom(birth: Date | null, death: Date | null): number | null {
  if (!birth) return null;
  const end = death ? new Date(death) : new Date();
  const b = new Date(birth);
  let age = end.getUTCFullYear() - b.getUTCFullYear();
  const monthDiff = end.getUTCMonth() - b.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getUTCDate() < b.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

const longDate = (d: Date | null) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const person = await getPerson(slug);
  // Thrown here, not just in the page: for bots with blocking metadata this is
  // what turns a missing person into a real 404 instead of a soft one.
  if (!person) notFound();

  const films = new Set([
    ...person.castRoles.map((c) => c.movieId),
    ...person.crewRoles.map((c) => c.movieId),
  ]).size;
  const role =
    person.occupations[0] ??
    [...new Set(person.crewRoles.map((c) => c.job))][0] ??
    (person.castRoles.length > 0 ? "actor" : "film worker");

  // Everything on this page that is ours: prose we wrote, a portrait we own, or
  // criticism of their work. With none of it, the page restates a database —
  // hundreds of thousands of those arrived with the bulk credit import, and
  // offering them as destinations is how a domain becomes a directory. Reachable
  // and crawled onward from; not submitted. The sitemap applies the same rule,
  // and a page graduates the moment someone writes about one of their films.
  const reviewed = [...person.castRoles, ...person.crewRoles].some(
    (c) => c.movie.reviews.length > 0,
  );
  const ours = Boolean(person.bio || person.notes || person.image) || reviewed;

  return pageMetadata({
    path: `/people/${person.slug}`,
    title: person.name,
    description:
      person.bio ??
      `${person.name} — ${role}. ${films} film${films === 1 ? "" : "s"} in the CinePixo library, with every review written here about their work.`,
    keywords: [person.name, `${person.name} films`, `${person.name} reviews`, role],
    noIndex: !ours,
    // A person page is a profile, and it has a clean-markdown sibling.
    ogType: "profile",
    markdownPath: `/people/${person.slug}.md`,
    // No `images`: the segment's opengraph-image.tsx draws the house card.
  });
}

export default async function PersonPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const person = await getPerson(slug);
  if (!person) notFound();

  // One entry per film, carrying every hat they wore on it.
  const byFilm = new Map<
    string,
    {
      movie: (typeof person.castRoles)[number]["movie"];
      characters: string[];
      jobs: string[];
    }
  >();
  for (const c of person.castRoles) {
    const e = byFilm.get(c.movieId) ?? { movie: c.movie, characters: [], jobs: [] };
    if (c.character) e.characters.push(c.character);
    else if (!e.characters.length) e.characters.push("Actor");
    byFilm.set(c.movieId, e);
  }
  for (const c of person.crewRoles) {
    const e = byFilm.get(c.movieId) ?? { movie: c.movie, characters: [], jobs: [] };
    if (!e.jobs.includes(c.job)) e.jobs.push(c.job);
    byFilm.set(c.movieId, e);
  }

  const movieIds = [...byFilm.keys()];
  const [criticism, collaborators] = await Promise.all([
    getCriticism(movieIds),
    getCollaborators(movieIds, person.id),
  ]);

  const filmography = [...byFilm.values()]
    .map((f) => {
      const ratings = f.movie.reviews.map((r) => r.rating);
      return {
        ...f,
        year: yearOf(f.movie.releaseDate),
        average:
          ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null,
        reviewCount: ratings.length,
      };
    })
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  const ratedFilms: RatedFilm[] = filmography.map((f) => ({
    slug: f.movie.slug,
    title: f.movie.title,
    year: f.year,
    average: f.average,
    reviewCount: f.reviewCount,
  }));

  const allRatings = filmography.flatMap((f) => f.movie.reviews.map((r) => r.rating));
  const careerAverage =
    allRatings.length > 0 ? allRatings.reduce((s, r) => s + r, 0) / allRatings.length : null;

  const activeYears = filmography.map((f) => f.year).filter((y): y is number => y !== null);
  const age = ageFrom(person.birthDate, person.deathDate);
  const jobs = [...new Set(person.crewRoles.map((c) => c.job))];
  const roleLine =
    person.occupations.length > 0
      ? person.occupations
      : [...(person.castRoles.length > 0 ? ["Actor"] : []), ...jobs];

  const ourLinks = Array.isArray(person.links)
    ? (person.links as { label?: string; url?: string }[]).filter(
        (l): l is { label: string; url: string } =>
          typeof l?.label === "string" && typeof l?.url === "string" && /^https?:\/\//.test(l.url),
      )
    : [];

  const sources = [
    person.wikipediaUrl ? { label: "Wikipedia", url: person.wikipediaUrl } : null,
    person.wikidataId
      ? { label: `Wikidata ${person.wikidataId}`, url: `https://www.wikidata.org/wiki/${person.wikidataId}` }
      : null,
    person.imdbId
      ? { label: "IMDb", url: `https://www.imdb.com/name/${person.imdbId}/` }
      : null,
    ...ourLinks,
  ].filter((s): s is { label: string; url: string } => s !== null);

  const path = `/people/${person.slug}`;
  const trail: Crumb[] = [{ name: "People", path: "/people" }, { name: person.name }];

  const jsonLd = graph(
    webPageNode({
      path,
      name: person.name,
      description: person.bio ?? undefined,
      dateModified: person.updatedAt,
      hasBreadcrumb: true,
      aboutId: peopleEntityId(person.slug),
      mainEntityId: peopleEntityId(person.slug),
    }),
    breadcrumbNode(path, trail),
    {
      "@type": "Person",
      "@id": peopleEntityId(person.slug),
      url: absUrl(path),
      name: person.name,
      ...(person.bio ? { description: person.bio } : {}),
      ...(person.image ? { image: absUrl(person.image) } : {}),
      ...(person.birthDate ? { birthDate: isoDay(person.birthDate) } : {}),
      ...(person.deathDate ? { deathDate: isoDay(person.deathDate) } : {}),
      ...(person.birthPlace ? { birthPlace: { "@type": "Place", name: person.birthPlace } } : {}),
      ...(roleLine.length > 0 ? { jobTitle: roleLine } : {}),
      ...(sources.length > 0 ? { sameAs: sources.map((s) => s.url) } : {}),
    },
    // The filmography as a list of movie entities the graph already knows —
    // each entry points at the film's own @id, so a crawler resolves the same
    // nine films here and on their pages rather than nine fresh strings.
    filmography.length > 0
      ? itemListNode({
          path,
          name: `${person.name} — films on CinePixo`,
          entries: filmography.map((f) => ({
            path: `/movies/${f.movie.slug}`,
            name: f.movie.title,
            entityId: movieEntityId(f.movie.slug),
          })),
          totalItems: filmography.length,
        })
      : null,
  );

  type SpecRow = [label: string, value: React.ReactNode];
  const maybeRows: (SpecRow | null)[] = [
    person.birthDate
      ? ["Born", `${longDate(person.birthDate)}${age != null && !person.deathDate ? ` (age ${age})` : ""}`]
      : null,
    person.deathDate ? ["Died", `${longDate(person.deathDate)}${age != null ? ` (aged ${age})` : ""}`] : null,
    person.birthPlace ? ["From", person.birthPlace] : null,
    roleLine.length > 0 ? ["Known for", roleLine.slice(0, 4).join(", ")] : null,
    activeYears.length > 0
      ? [
          "In the library",
          activeYears.length > 1 && Math.min(...activeYears) !== Math.max(...activeYears)
            ? `${Math.min(...activeYears)}–${Math.max(...activeYears)}`
            : String(activeYears[0]),
        ]
      : null,
    ["Films here", String(filmography.length)],
    careerAverage != null
      ? [
          "Fandom average",
          <span key="avg" className="text-accent">
            {toStarScale(careerAverage).toFixed(2)} of 5 · {allRatings.length} review
            {allRatings.length === 1 ? "" : "s"}
          </span>,
        ]
      : ["Fandom average", <span key="none" className="text-muted">nothing written yet</span>],
  ];
  const specRows = maybeRows.filter((r): r is SpecRow => r !== null);

  return (
    <div>
      <JsonLd data={jsonLd} />
      <Breadcrumbs trail={trail} />

      {/* ── Who ── */}
      <header className="mt-4 flex flex-wrap items-start gap-6">
        <div className="shrink-0">
          <PersonPortrait person={person} size={168} priority />
          {/* A licensed photograph obliges a credit. Rendered, not filed away. */}
          {person.imageCredit && (
            <p className="mt-2 max-w-[168px] text-[10px] leading-snug text-muted">
              {person.imageSourceUrl ? (
                <a
                  href={person.imageSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline underline-offset-2 hover:text-accent"
                >
                  {person.imageCredit}
                </a>
              ) : (
                person.imageCredit
              )}
              {person.imageLicense && (
                <>
                  {" · "}
                  {person.imageLicenseUrl ? (
                    <a
                      href={person.imageLicenseUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline underline-offset-2 hover:text-accent"
                    >
                      {person.imageLicense}
                    </a>
                  ) : (
                    person.imageLicense
                  )}
                </>
              )}
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-4xl font-bold tracking-tight">{person.name}</h1>
          {roleLine.length > 0 && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
              {roleLine.slice(0, 4).join(" · ")}
            </p>
          )}
          {person.bio && (
            <p className="mt-4 max-w-2xl text-[1.02rem] leading-relaxed">{person.bio}</p>
          )}

          {/* The three numbers, large enough to be the answer to "why is this
              page here?" */}
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            <Stat value={String(filmography.length)} label="films here" />
            <Stat value={String(allRatings.length)} label="reviews" />
            {careerAverage != null && (
              <Stat value={toStarScale(careerAverage).toFixed(2)} label="fandom ★" accent />
            )}
            {collaborators.length > 0 && (
              <Stat value={String(collaborators.length)} label="regular collaborators" />
            )}
          </div>

          {sources.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
              {sources.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-mono text-[11px] text-muted underline underline-offset-2 hover:text-accent"
                >
                  {s.label} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      </header>

      <ReelDivider className="my-9" />

      {/* ── Two columns: the argument, then the lookup material ── */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-10">
          {person.notes && (
            <section>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                On their work
              </h2>
              <p className="mt-3 whitespace-pre-line text-[1.02rem] leading-relaxed">
                {person.notes}
              </p>
            </section>
          )}

          <PersonStats films={ratedFilms} />

          {/* Filmography as a table: year, film, what they did, what it scored.
              A poster rail looked handsome and answered none of those. */}
          <section>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              Filmography · {filmography.length}
            </h2>
            <div className="mt-3 border-t border-line">
              {filmography.map((f) => (
                <Link
                  key={f.movie.id}
                  href={`/movies/${f.movie.slug}`}
                  className="group grid grid-cols-[2.75rem_2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-2.5 transition-colors hover:bg-surface/60"
                >
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {f.year ?? "—"}
                  </span>
                  <Poster
                    path={f.movie.posterPath}
                    title={f.movie.title}
                    size="thumb"
                    className="aspect-2/3 w-full rounded border border-line object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium transition-colors group-hover:text-accent">
                      {f.movie.title}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted">
                      {[...f.jobs, ...f.characters].join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {f.average != null ? (
                      <>
                        <span className="font-mono text-sm text-accent tabular-nums">
                          {toStarScale(f.average).toFixed(1)}
                        </span>
                        <span className="block font-mono text-[10px] text-muted">
                          {f.reviewCount} review{f.reviewCount === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-[11px] text-muted">unreviewed</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                Criticism · {criticism.length}
              </h2>
              <Link href="/write" className="text-xs text-accent hover:opacity-80">
                Write about their work →
              </Link>
            </div>
            {criticism.length === 0 ? (
              <p className="mt-4 text-muted">Nothing written on their work here yet.</p>
            ) : (
              <div className="mt-4">
                <ReviewIndex reviews={criticism} />
              </div>
            )}
          </section>
        </div>

        {/* ── The panel a reader scans ── */}
        <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <section>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              At a glance
            </h2>
            <dl className="mt-3">
              {specRows.map(([label, value]) => (
                <div key={label} className="border-b border-line py-2 first:border-t">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-sm">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <Collaborators people={collaborators} />

          {sources.length > 0 && (
            <section>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                Sources
              </h2>
              <p className="mt-1 text-xs text-muted">
                Dates and places come from these. The writing on this page does not.
              </p>
              <ul className="mt-2 space-y-1">
                {sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-xs text-muted underline underline-offset-2 hover:text-accent"
                    >
                      {s.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className={`text-2xl font-bold tabular-nums ${accent ? "text-accent" : ""}`}>{value}</p>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
    </div>
  );
}
