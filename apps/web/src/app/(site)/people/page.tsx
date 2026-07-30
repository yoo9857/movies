import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { PersonPortrait } from "@/components/PersonPortrait";
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
 * The directory of everyone in the library.
 *
 * Ordered by how much criticism exists on their work rather than alphabetically
 * or by billing: this is a site about the writing, so the people the fandom has
 * actually argued about come first. Alphabetical is available below for anyone
 * looking someone up.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  path: "/people",
  title: "People",
  description:
    "Actors, directors and crew in the CinePixo library — each with their filmography and every review written here about their work.",
  keywords: ["film directors", "actors", "film crew", "film criticism"],
});

export default async function PeoplePage() {
  const people = await prisma.person.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      image: true,
      tmdbProfilePath: true,
      castRoles: { select: { movieId: true } },
      crewRoles: { select: { movieId: true, job: true } },
    },
    orderBy: { name: "asc" },
  });

  const enriched = people
    .map((p) => {
      const films = new Set([
        ...p.castRoles.map((c) => c.movieId),
        ...p.crewRoles.map((c) => c.movieId),
      ]);
      const jobs = [...new Set(p.crewRoles.map((c) => c.job))];
      return {
        ...p,
        filmCount: films.size,
        role: jobs[0] ?? (p.castRoles.length > 0 ? "Actor" : null),
      };
    })
    // Anyone credited on more than one film in the library leads — that is
    // where a career starts to be visible rather than a single appearance.
    .sort((a, b) => b.filmCount - a.filmCount || a.name.localeCompare(b.name));

  const featured = enriched.filter((p) => p.filmCount > 1).slice(0, 12);

  const path = "/people";
  const trail: Crumb[] = [{ name: "People" }];

  const jsonLd = graph(
    webPageNode({
      path,
      kind: "CollectionPage",
      name: "People",
      description: "Everyone in the CinePixo library, with the criticism on their work.",
      hasBreadcrumb: true,
    }),
    breadcrumbNode(path, trail),
    itemListNode({
      path,
      name: "People",
      entries: enriched.slice(0, 100).map((p) => ({
        path: `/people/${p.slug}`,
        name: p.name,
        entityId: peopleEntityId(p.slug),
      })),
      totalItems: enriched.length,
    }),
  );

  return (
    <div>
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold tracking-tight">People</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Everyone the library credits — and, on each page, every review written here about their
        work.
      </p>

      {featured.length > 0 && (
        <section className="mt-9">
          <SectionHead>Across more than one film</SectionHead>
          <div className="cx-rail mt-3">
            {featured.map((p) => (
              <Link key={p.id} href={`/people/${p.slug}`} className="group w-24 text-center">
                <PersonPortrait
                  person={p}
                  size={96}
                  className="mx-auto transition-transform group-hover:scale-[1.04]"
                />
                <p className="mt-2 truncate text-xs font-medium transition-colors group-hover:text-accent">
                  {p.name}
                </p>
                <p className="truncate font-mono text-[11px] text-muted">{p.filmCount} films</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <ReelDivider className="my-9" />

      <section>
        <SectionHead>Everyone · {enriched.length}</SectionHead>
        <div className="mt-3 border-t border-line">
          {[...enriched]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <Link
                key={p.id}
                href={`/people/${p.slug}`}
                className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-line py-2.5 transition-colors hover:bg-surface/60"
              >
                <PersonPortrait person={p} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-sm transition-colors group-hover:text-accent">
                    {p.name}
                  </span>
                  {p.role && (
                    <span className="block truncate font-mono text-[11px] text-muted">
                      {p.role}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {p.filmCount} film{p.filmCount === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
        </div>
      </section>
    </div>
  );
}
