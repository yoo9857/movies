import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { PersonCard } from "@/components/PersonCard";
import { ReelDivider, SectionHead } from "@/components/ReelDivider";
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
 * The directory, as faces.
 *
 * Two questions get two treatments. "Who is worth looking at?" is answered by a
 * card grid ordered by how much criticism exists on their work — this is a site
 * about the writing, so the people the fandom has actually argued about lead.
 * "Where is this specific person?" is answered by the alphabetical rail
 * underneath, grouped by initial so a name is two glances away rather than a
 * scroll through a hundred rows.
 *
 * Filtering is by department, as chips: the same selection surface the film
 * library uses, and each one its own URL.
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

export async function generateMetadata(props: {
  searchParams: Promise<{ role?: string }>;
}): Promise<Metadata> {
  const { role } = await props.searchParams;
  const active = DEPARTMENTS.find((d) => d === role);
  return pageMetadata({
    path: active ? `/people?role=${encodeURIComponent(active)}` : "/people",
    title: active ? `${active === "Acting" ? "Actors" : `${active}s`}` : "People",
    description: active
      ? `Everyone credited as ${active} in the CinePixo library, with the reviews written here about their work.`
      : "Actors, directors and crew in the CinePixo library — each with their filmography and every review written here about their work.",
    keywords: ["film directors", "actors", "film crew", "film criticism"],
  });
}

export default async function PeoplePage(props: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await props.searchParams;
  const activeRole = DEPARTMENTS.find((d) => d === role) ?? null;

  const people = await prisma.person.findMany({
    where: {
      OR: [{ castRoles: { some: {} } }, { crewRoles: { some: {} } }],
      ...(activeRole === "Acting"
        ? { castRoles: { some: {} } }
        : activeRole
          ? { crewRoles: { some: { job: activeRole } } }
          : {}),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      image: true,
      tmdbProfilePath: true,
      castRoles: {
        select: {
          movieId: true,
          movie: {
            select: { reviews: { where: { status: "PUBLISHED" }, select: { rating: true } } },
          },
        },
      },
      crewRoles: {
        select: {
          movieId: true,
          job: true,
          movie: {
            select: { reviews: { where: { status: "PUBLISHED" }, select: { rating: true } } },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const cards = people.map((p) => {
    // One rating per film, not per credit: someone who both wrote and directed a
    // film must not have it counted twice.
    const films = new Map<string, number[]>();
    for (const c of [...p.castRoles, ...p.crewRoles]) {
      films.set(c.movieId, c.movie.reviews.map((r) => r.rating));
    }
    const ratings = [...films.values()].flat();
    const jobs = [...new Set(p.crewRoles.map((c) => c.job))];
    return {
      slug: p.slug,
      name: p.name,
      image: p.image,
      tmdbProfilePath: p.tmdbProfilePath,
      filmCount: films.size,
      role: jobs[0] ?? (p.castRoles.length > 0 ? "Actor" : null),
      reviewCount: ratings.length,
      fandomAvg:
        ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null,
    };
  });

  // Most-written-about first; films in the library break ties.
  const featured = [...cards]
    .sort(
      (a, b) =>
        b.reviewCount - a.reviewCount ||
        b.filmCount - a.filmCount ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 18);

  // Alphabetical, grouped by initial. Non-Latin initials collect under "#" so a
  // Korean or Japanese credit is findable rather than lost at the end.
  const byInitial = new Map<string, typeof cards>();
  for (const p of [...cards].sort((a, b) => a.name.localeCompare(b.name))) {
    const first = p.name.trim().charAt(0).toUpperCase();
    const key = /^[A-Z]$/.test(first) ? first : "#";
    byInitial.set(key, [...(byInitial.get(key) ?? []), p]);
  }
  const initials = [...byInitial.keys()].sort((a, b) =>
    a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b),
  );

  const path = activeRole ? `/people?role=${encodeURIComponent(activeRole)}` : "/people";
  const trail: Crumb[] = [{ name: "People" }];

  const jsonLd = graph(
    webPageNode({
      path,
      kind: "CollectionPage",
      name: activeRole ?? "People",
      description: "Everyone in the CinePixo library, with the criticism on their work.",
      hasBreadcrumb: true,
    }),
    breadcrumbNode(path, trail),
    itemListNode({
      path,
      name: activeRole ?? "People",
      entries: featured.map((p) => ({
        path: `/people/${p.slug}`,
        name: p.name,
        entityId: peopleEntityId(p.slug),
      })),
      totalItems: cards.length,
    }),
  );

  const chip = "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors whitespace-nowrap";
  const chipOff = "border-line text-muted hover:border-accent-dim hover:text-foreground";
  const chipOn = "border-accent bg-accent text-black font-semibold";

  return (
    <div>
      <JsonLd data={jsonLd} />

      <h1 className="text-3xl font-bold tracking-tight">People</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Everyone the library credits — and, on each page, every review written here about their
        work.
      </p>

      {/* Department chips: same selection surface as the film library. */}
      <div className="mt-6 space-y-3 border-y border-line py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-xs text-muted">
            {cards.length.toLocaleString("en-US")} {cards.length === 1 ? "person" : "people"}
          </span>
          {activeRole && (
            <Link
              href="/people"
              className="ml-auto text-xs text-muted underline underline-offset-2 hover:text-foreground"
            >
              Clear filter
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Role
          </span>
          <div className="cx-rail flex gap-1.5 pb-1">
            <Link
              href="/people"
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
                  href={on ? "/people" : `/people?role=${encodeURIComponent(d)}`}
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

      {cards.length === 0 ? (
        <p className="mt-10 text-muted">Nobody credited as {activeRole} yet.</p>
      ) : (
        <>
          <section className="mt-9">
            <SectionHead
              action={
                <span className="hidden font-mono text-[10px] text-muted sm:inline">
                  most written about first
                </span>
              }
            >
              {activeRole ? (activeRole === "Acting" ? "Actors" : activeRole) : "The library"}
            </SectionHead>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {featured.map((p) => (
                <PersonCard key={p.slug} person={p} />
              ))}
            </div>
          </section>

          <ReelDivider className="my-10" />

          <section>
            <SectionHead>Everyone, A–Z</SectionHead>
            {/* Jump bar: a hundred names is a scroll, twenty-six letters is a glance. */}
            <div className="cx-rail mt-3 flex gap-1 pb-1">
              {initials.map((letter) => (
                <a
                  key={letter}
                  href={`#letter-${letter === "#" ? "other" : letter}`}
                  className="shrink-0 rounded border border-line px-2 py-0.5 font-mono text-xs text-muted transition-colors hover:border-accent-dim hover:text-accent"
                >
                  {letter}
                </a>
              ))}
            </div>
            <div className="mt-5 space-y-6">
              {initials.map((letter) => (
                <div key={letter} id={`letter-${letter === "#" ? "other" : letter}`}>
                  <h3 className="scroll-mt-24 font-mono text-xs uppercase tracking-[0.16em] text-accent">
                    {letter}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(byInitial.get(letter) ?? []).map((p) => (
                      <Link
                        key={p.slug}
                        href={`/people/${p.slug}`}
                        className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted transition-colors hover:border-accent-dim hover:text-foreground"
                      >
                        {p.name}
                        <span className="ml-1.5 font-mono text-[10px] text-muted/70">
                          {p.filmCount}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
