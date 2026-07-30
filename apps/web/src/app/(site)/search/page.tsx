import { prisma } from "@cinepixo/db";
import { TOPIC_KIND_LABELS } from "@cinepixo/shared";
import { PersonPortrait } from "@/components/PersonPortrait";
import type { Metadata } from "next";
import Link from "next/link";
import { Poster } from "@/components/Poster";
import { StarRating } from "@/components/StarRating";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const sp = await props.searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);

  return pageMetadata({
    // Canonical to the bare /search: one query string per visitor would
    // otherwise mint an unbounded number of thin, near-duplicate URLs.
    path: "/search",
    title: q ? `Search — ${q}` : "Search",
    description: "Search reviews, films, people, themes and critics on CinePixo.",
    // Results pages are excluded from the index but still followed, so the
    // reviews and films they link to keep being discovered through them.
    noIndex: true,
  });
}

export default async function SearchPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await props.searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);

  // ILIKE, not LIKE — "parasite" must find "Parasite". The trigram indexes
  // exist precisely for this; see the search API route for the history.
  const ci = (value: string) => ({ contains: value, mode: "insensitive" as const });

  const [reviews, movies, critics, people, topics] = q
    ? await Promise.all([
        prisma.review.findMany({
          where: {
            status: "PUBLISHED",
            // Body and verdict included — see the API route for why.
            OR: [{ title: ci(q) }, { excerpt: ci(q) }, { verdict: ci(q) }, { content: ci(q) }],
          },
          orderBy: { publishedAt: "desc" },
          take: 10,
          select: {
            slug: true,
            title: true,
            excerpt: true,
            rating: true,
            movie: { select: { title: true } },
          },
        }),
        prisma.movie.findMany({
          where: {
            OR: [{ title: ci(q) }, { originalTitle: ci(q) }, { director: ci(q) }],
          },
          take: 10,
          select: { id: true, slug: true, title: true, posterPath: true, releaseDate: true, director: true },
        }),
        prisma.critic.findMany({
          where: { name: ci(q) },
          take: 10,
          select: { slug: true, name: true, bio: true },
        }),
        // Only people with credits — a page with nothing on it is a dead result.
        prisma.person.findMany({
          where: {
            name: ci(q),
            OR: [{ castRoles: { some: {} } }, { crewRoles: { some: {} } }],
          },
          take: 12,
          select: {
            id: true,
            slug: true,
            name: true,
            image: true,
            tmdbProfilePath: true,
            crewRoles: { select: { job: true } },
            _count: { select: { castRoles: true, crewRoles: true } },
          },
        }),
        // Axes with films behind them; the definition is searched too, so
        // "stairs" reaches the motif about height as status.
        prisma.topic.findMany({
          where: { movies: { some: {} }, OR: [{ name: ci(q) }, { description: ci(q) }] },
          orderBy: [{ kind: "asc" }, { name: "asc" }],
          take: 10,
          select: {
            slug: true,
            name: true,
            kind: true,
            description: true,
            _count: { select: { movies: true } },
          },
        }),
      ])
    : [[], [], [], [], []];

  const empty =
    q &&
    reviews.length === 0 &&
    movies.length === 0 &&
    critics.length === 0 &&
    people.length === 0 &&
    topics.length === 0;

  return (
    <div>
      <h1 className="text-2xl font-bold">Search</h1>
      <form action="/search" method="get" className="mt-4 flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder="Reviews, films, people, themes…"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
        >
          Search
        </button>
      </form>

      {empty && <p className="mt-8 text-muted">No results for “{q}”.</p>}

      {reviews.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase text-muted">Reviews</h2>
          <ul className="mt-3 space-y-2">
            {reviews.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/reviews/${r.slug}`}
                  className="group flex items-center justify-between gap-4 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-accent-dim"
                >
                  <div className="min-w-0">
                    <p className="font-medium group-hover:text-accent transition-colors">
                      {r.title}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {r.movie.title}
                      {r.excerpt ? ` — ${r.excerpt}` : ""}
                    </p>
                  </div>
                  <StarRating rating={r.rating} showNumber={false} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {people.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase text-muted">People</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {people.map((p) => {
              const jobs = [...new Set(p.crewRoles.map((c) => c.job))];
              const role = jobs[0] ?? (p._count.castRoles > 0 ? "Actor" : null);
              return (
                <Link
                  key={p.id}
                  href={`/people/${p.slug}`}
                  className="group flex items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-4 transition-colors hover:border-accent-dim"
                >
                  <PersonPortrait person={p} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm transition-colors group-hover:text-accent">
                      {p.name}
                    </span>
                    {role && (
                      <span className="block truncate font-mono text-[10px] text-muted">
                        {role}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {movies.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase text-muted">Movies</h2>
          <div className="mt-3 grid grid-cols-3 gap-4 sm:grid-cols-5">
            {movies.map((m) => (
              <Link key={m.id} href={`/movies/${m.slug}`} className="group">
                <Poster
                  path={m.posterPath}
                  title={m.title}
                  year={m.releaseDate ? new Date(m.releaseDate).getFullYear() : null}
                  director={m.director}
                  className="aspect-2/3 w-full rounded-lg border border-line"
                />
                <p className="mt-1 truncate text-xs group-hover:text-accent transition-colors">
                  {m.title}
                  {m.releaseDate ? ` (${new Date(m.releaseDate).getFullYear()})` : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {topics.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase text-muted">Themes &amp; motifs</h2>
          <ul className="mt-3 space-y-2">
            {topics.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/topics/${t.slug}`}
                  className="group block rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-accent-dim"
                >
                  <p className="flex items-baseline gap-2">
                    <span className="font-medium transition-colors group-hover:text-accent">
                      {t.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                      {TOPIC_KIND_LABELS[t.kind]}
                    </span>
                    <span className="font-mono text-[10px] text-muted tabular-nums">
                      {t._count.movies} film{t._count.movies === 1 ? "" : "s"}
                    </span>
                  </p>
                  {t.description && (
                    <p className="line-clamp-1 text-xs text-muted">{t.description}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {critics.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase text-muted">Critics</h2>
          <ul className="mt-3 space-y-2">
            {critics.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/critics/${c.slug}`}
                  className="group block rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-accent-dim"
                >
                  <p className="font-medium group-hover:text-accent transition-colors">{c.name}</p>
                  {c.bio && <p className="line-clamp-1 text-xs text-muted">{c.bio}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
