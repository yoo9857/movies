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
import { PostRow } from "@/components/blog/PostRow";
import { Collaborators, type Collaborator } from "@/components/person/Collaborators";
import { PersonStats, type RatedFilm } from "@/components/person/PersonStats";
import { rankedRoles } from "@/lib/person-roles";
import {
  absUrl,
  breadcrumbNode,
  type Crumb,
  graph,
  hosted,
  imageObjectNode,
  isoDay,
  itemListNode,
  movieEntityId,
  pageMetadata,
  peopleEntityId,
  postEntityId,
  primaryImageId,
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
  image: true,
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
 * Blog posts written about this person — the other half of `PostPerson`.
 *
 * A piece filed under Away From Set links here; this is the link back. The pair is
 * the point of having the join table at all: without it a post about an actor is
 * a page a crawler reaches once from a feed, and their page stays a filmography
 * with nothing written on it.
 */
const getWritingAbout = cache(async (personId: string) =>
  prisma.post.findMany({
    where: { status: "PUBLISHED", people: { some: { personId } } },
    orderBy: { publishedAt: "desc" },
    take: 6,
    select: {
      slug: true,
      title: true,
      dek: true,
      category: true,
      format: true,
      publishedAt: true,
      image: true,
      imageAlt: true,
      author: { select: { username: true, displayName: true } },
    },
  }),
);

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

/**
 * "1892–1957", "b. 1971", "d. 1957" — the disambiguator a name alone cannot be.
 *
 * Search Console says people arrive having typed the role themselves ("morgunov
 * actor", "director terence young", "nirav shah cinematographer"), which is what
 * someone does when a bare name is ambiguous. Life years do the same job for the
 * many namesakes a 208,000-person credit graph contains.
 */
function lifeYears(birth: Date | null, death: Date | null): string | null {
  const b = yearOf(birth);
  const d = yearOf(death);
  if (b && d) return `${b}–${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return null;
}

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
  const roles = rankedRoles({
    occupations: person.occupations,
    castCredits: person.castRoles.length,
    crewJobs: person.crewRoles.map((c) => c.job),
  });
  const role = roles[0] ?? "film worker";
  const years = lifeYears(person.birthDate, person.deathDate);
  // Put a living person's age in the search snippet as well as the facts
  // panel. An age at death is already stated next to the death date.
  const age = ageFrom(person.birthDate, person.deathDate);
  const ageAnswer = age != null && !person.deathDate ? `Age ${age}.` : null;
  // Only the films actually written about here, so the sentence below can stop
  // promising reviews on the 207,876 pages that have none.
  const reviewedFilms = new Set(
    [...person.castRoles, ...person.crewRoles]
      .filter((c) => c.movie.reviews.length > 0)
      .map((c) => c.movieId),
  ).size;

  // Everything on this page that is *written*: prose we wrote, or criticism of
  // their work. With none of it, the page restates a database — hundreds of
  // thousands of those arrived with the bulk credit import, and offering them
  // as destinations is how a domain becomes a directory. Reachable and crawled
  // onward from; not submitted. The sitemap applies the same rule, and a page
  // graduates the moment someone writes about one of their films.
  //
  // A portrait used to count, back when 173 of them existed and importing one
  // meant someone had chosen this person. The portrait pass then filled 27,000,
  // and the rule that had been a proxy for editorial attention became a rule
  // that indexed a database with faces on it — the same way "credited on
  // anything" failed before it. An imported photograph is not a reason to read
  // a page, so it no longer makes one indexable. It still renders.
  const reviewed = [...person.castRoles, ...person.crewRoles].some(
    (c) => c.movie.reviews.length > 0,
  );
  const ours = Boolean(person.bio || person.notes) || reviewed;

  return pageMetadata({
    path: `/people/${person.slug}`,
    // The role and the life years, because that is how the searcher wrote the
    // query. A bare name competes with every namesake in the credit graph and
    // tells a result page nothing it did not already know from the query itself.
    title: years ? `${person.name} — ${role} (${years})` : `${person.name} — ${role}`,
    // The facts, in the order they are asked for. This used to end "with every
    // review written here about their work" unconditionally — a promise that was
    // false on all but 272 of 208,148 pages, made in the one sentence Google
    // shows. `clamp` cuts this at 158 characters, so the load-bearing half comes
    // first: who they are, when they lived, where they were from.
    description: [
        `${person.name} — ${roles.slice(0, 2).join(", ") || role}${years ? ` (${years})` : ""}.`,
        ageAnswer,
      person.birthPlace ? `Born in ${person.birthPlace}.` : null,
      person.deathPlace ? `Died in ${person.deathPlace}.` : null,
        person.bio,
        `${films} film${films === 1 ? "" : "s"} in the CinePixo library.`,
        reviewedFilms > 0
          ? `${reviewedFilms} reviewed here.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    keywords: [
      person.name,
      `${person.name} films`,
      `${person.name} reviews`,
      ...(ageAnswer ? [`${person.name} age`] : []),
      role,
    ],
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
  const [criticism, collaborators, writing] = await Promise.all([
    getCriticism(movieIds),
    getCollaborators(movieIds, person.id),
    getWritingAbout(person.id),
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
  // Same ranking the title and description use, so "Known for" on the page, the
  // <title> in the tab and `jobTitle` in the graph never disagree about what
  // this person does.
  const roleLine = rankedRoles({
    occupations: person.occupations,
    castCredits: person.castRoles.length,
    crewJobs: person.crewRoles.map((c) => c.job),
  });

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

  // The photograph, described once with everything the caption under it prints.
  // A Commons portrait is licensed rather than free, and the properties Google's
  // image metadata reads are the same three facts the credit line renders: who
  // took it, who holds the copyright, and where the terms live.
  const portrait = imageObjectNode({
    id: primaryImageId(path),
    url: person.image,
    caption: person.name,
    credit: person.imageCredit,
    license: person.imageLicense,
    licenseUrl: person.imageLicenseUrl,
    sourceUrl: person.imageSourceUrl,
  });

  const jsonLd = graph(
    webPageNode({
      path,
      name: person.name,
      description: person.bio ?? undefined,
      dateModified: person.updatedAt,
      hasBreadcrumb: true,
      aboutId: peopleEntityId(person.slug),
      mainEntityId: peopleEntityId(person.slug),
      image: hosted(person.image),
      imageId: portrait ? primaryImageId(path) : undefined,
    }),
    breadcrumbNode(path, trail),
    portrait,
    {
      "@type": "Person",
      "@id": peopleEntityId(person.slug),
      url: absUrl(path),
      name: person.name,
      ...(person.bio ? { description: person.bio } : {}),
      // By `@id`: the described node above is the same photograph, and one file
      // described twice is how a complete description reads as an incomplete one.
      ...(portrait ? { image: { "@id": primaryImageId(path) } } : {}),
      ...(person.birthDate ? { birthDate: isoDay(person.birthDate) } : {}),
      ...(person.deathDate ? { deathDate: isoDay(person.deathDate) } : {}),
      ...(person.birthPlace ? { birthPlace: { "@type": "Place", name: person.birthPlace } } : {}),
      ...(person.deathPlace ? { deathPlace: { "@type": "Place", name: person.deathPlace } } : {}),
      ...(roleLine.length > 0 ? { jobTitle: roleLine } : {}),
      ...(sources.length > 0 ? { sameAs: sources.map((s) => s.url) } : {}),
      // Our own writing about them, by `@id`. `subjectOf` is the property that
      // says "this person is the subject of that article" — which is exactly
      // what a PostPerson row records, and the claim an answer engine needs to
      // credit us rather than the wire service we cited.
      ...(writing.length > 0
        ? { subjectOf: writing.map((p) => ({ "@id": postEntityId(p.slug) })) }
        : {}),
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
    person.deathPlace ? ["Place of death", person.deathPlace] : null,
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
                    image={f.movie.image}
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

          {/* ── Our blog, on them ──
              Reviews cover the work; these cover the person. Rendered only when
              there is something, because a heading promising writing that does
              not exist is worse than no heading. */}
          {writing.length > 0 && (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                  Away from set · {writing.length}
                </h2>
                <Link href="/blog" className="text-xs text-accent hover:opacity-80">
                  The blog →
                </Link>
              </div>
              <div className="mt-4 divide-y divide-line border-y border-line">
                {writing.map((p) => (
                  <PostRow key={p.slug} post={p} />
                ))}
              </div>
            </section>
          )}
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
