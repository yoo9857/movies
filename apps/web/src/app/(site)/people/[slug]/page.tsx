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
import { ReelDivider, SectionHead } from "@/components/ReelDivider";
import { ReviewIndex } from "@/components/ReviewIndex";
import {
  absUrl,
  breadcrumbNode,
  type Crumb,
  graph,
  isoDay,
  pageMetadata,
  peopleEntityId,
  webPageNode,
} from "@/lib/seo";

/**
 * A person, as this site knows them.
 *
 * The filmography is a fact anyone can look up. What is here and nowhere else
 * is the last section: every review on CinePixo that discusses this person,
 * with the scores those reviews gave. That is the page's reason to exist —
 * a database entry is a lookup, this is an argument about a career.
 */

export const dynamic = "force-dynamic";

const include = {
  castRoles: {
    include: {
      movie: {
        select: {
          id: true,
          slug: true,
          title: true,
          posterPath: true,
          releaseDate: true,
          reviews: {
            where: { status: "PUBLISHED" as const },
            select: { rating: true },
          },
        },
      },
    },
  },
  crewRoles: {
    include: {
      movie: {
        select: {
          id: true,
          slug: true,
          title: true,
          posterPath: true,
          releaseDate: true,
          reviews: {
            where: { status: "PUBLISHED" as const },
            select: { rating: true },
          },
        },
      },
    },
  },
};

const getPerson = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,130}$/i.test(slug)) return null;
  return prisma.person.findUnique({ where: { slug }, include });
});

/** Reviews of any film this person worked on — the criticism on them. */
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

const year = (d: Date | null) => (d ? new Date(d).getFullYear() : null);

function lifespan(person: { birthDate: Date | null; deathDate: Date | null }): string | null {
  const born = year(person.birthDate);
  const died = year(person.deathDate);
  if (!born && !died) return null;
  if (born && died) return `${born}–${died}`;
  if (born) return `b. ${born}`;
  return `d. ${died}`;
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const person = await getPerson(slug);
  if (!person) return { title: "Person not found", robots: { index: false, follow: false } };

  const jobs = [...new Set(person.crewRoles.map((c) => c.job))];
  const role =
    jobs.length > 0
      ? jobs.slice(0, 2).join(" and ")
      : person.castRoles.length > 0
        ? "Actor"
        : "Film worker";
  const films = new Set([
    ...person.castRoles.map((c) => c.movieId),
    ...person.crewRoles.map((c) => c.movieId),
  ]).size;

  return pageMetadata({
    path: `/people/${person.slug}`,
    title: person.name,
    description:
      person.bio ??
      `${person.name} — ${role.toLowerCase()}. ${films} film${films === 1 ? "" : "s"} in the CinePixo library, with the fandom's reviews of each.`,
    images: person.image
      ? [{ url: absUrl(person.image), width: 640, height: 640, alt: person.name }]
      : [],
    keywords: [person.name, `${person.name} films`, `${person.name} reviews`],
  });
}

export default async function PersonPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const person = await getPerson(slug);
  if (!person) notFound();

  // One entry per film, with every hat this person wore on it.
  const byFilm = new Map<
    string,
    {
      movie: (typeof person.castRoles)[number]["movie"];
      characters: string[];
      jobs: string[];
    }
  >();
  for (const c of person.castRoles) {
    const entry = byFilm.get(c.movieId) ?? { movie: c.movie, characters: [], jobs: [] };
    if (c.character) entry.characters.push(c.character);
    byFilm.set(c.movieId, entry);
  }
  for (const c of person.crewRoles) {
    const entry = byFilm.get(c.movieId) ?? { movie: c.movie, characters: [], jobs: [] };
    if (!entry.jobs.includes(c.job)) entry.jobs.push(c.job);
    byFilm.set(c.movieId, entry);
  }

  const films = [...byFilm.values()].sort(
    (a, b) => (year(b.movie.releaseDate) ?? 0) - (year(a.movie.releaseDate) ?? 0),
  );
  const criticism = await getCriticism([...byFilm.keys()]);

  // Only ever this site's own numbers, and only across films we have reviews of.
  const rated = films.flatMap((f) => f.movie.reviews.map((r) => r.rating));
  const fandomAvg = rated.length > 0 ? rated.reduce((s, r) => s + r, 0) / rated.length : null;

  const jobs = [...new Set(person.crewRoles.map((c) => c.job))];
  const roleLine = [
    person.castRoles.length > 0 ? "Actor" : null,
    ...jobs,
  ].filter(Boolean) as string[];

  const links = Array.isArray(person.links)
    ? (person.links as { label?: string; url?: string }[]).filter(
        (l): l is { label: string; url: string } =>
          typeof l?.label === "string" && typeof l?.url === "string" && /^https?:\/\//.test(l.url),
      )
    : [];

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
      ...(links.length > 0 ? { sameAs: links.map((l) => l.url) } : {}),
    },
  );

  return (
    <div className="space-y-10">
      <JsonLd data={jsonLd} />
      <Breadcrumbs trail={trail} />

      {/* ── Who they are ── */}
      <header className="flex flex-wrap items-start gap-6">
        <PersonPortrait person={person} size={148} priority />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{person.name}</h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {[roleLine.join(" · "), lifespan(person), person.birthPlace]
              .filter(Boolean)
              .join("  |  ")}
          </p>
          {person.bio && (
            <p className="mt-4 max-w-2xl text-[0.98rem] leading-relaxed">{person.bio}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-muted">
            <span>
              {films.length} film{films.length === 1 ? "" : "s"} here
            </span>
            {fandomAvg != null && (
              <span className="text-accent">
                ★ {toStarScale(fandomAvg).toFixed(2)} across {rated.length} review
                {rated.length === 1 ? "" : "s"}
              </span>
            )}
            {links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline underline-offset-2 hover:text-accent"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </header>

      {/* ── Our own notes: the part no database hands you ── */}
      {person.notes && (
        <>
          <ReelDivider />
          <section>
            <SectionHead>Notes</SectionHead>
            <p className="mt-3 max-w-2xl whitespace-pre-line text-[0.98rem] leading-relaxed">
              {person.notes}
            </p>
          </section>
        </>
      )}

      {/* ── Filmography ── */}
      <ReelDivider />
      <section>
        <SectionHead>In the library · {films.length}</SectionHead>
        <div className="cx-rail mt-3">
          {films.map((f) => (
            <Link key={f.movie.id} href={`/movies/${f.movie.slug}`} className="group w-28">
              <Poster
                path={f.movie.posterPath}
                title={f.movie.title}
                className="aspect-2/3 w-full rounded-lg border border-line transition-transform group-hover:scale-[1.03]"
              />
              <p className="mt-1.5 truncate text-xs transition-colors group-hover:text-accent">
                {f.movie.title}
              </p>
              <p className="truncate font-mono text-[11px] text-muted">
                {[year(f.movie.releaseDate), f.characters[0] ?? f.jobs[0]]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── The criticism: the reason this page exists ── */}
      <ReelDivider />
      <section>
        <SectionHead
          action={
            <span className="hidden font-mono text-[10px] text-muted sm:inline">
              written here, about their work
            </span>
          }
        >
          Criticism · {criticism.length}
        </SectionHead>
        {criticism.length === 0 ? (
          <p className="mt-4 text-muted">
            Nothing written on their work here yet —{" "}
            <Link href="/write" className="text-accent hover:opacity-80">
              be the first
            </Link>
            .
          </p>
        ) : (
          <div className="mt-4">
            <ReviewIndex reviews={criticism} />
          </div>
        )}
      </section>
    </div>
  );
}
