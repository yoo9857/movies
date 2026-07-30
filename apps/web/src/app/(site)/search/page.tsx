import { prisma } from "@cinepixo/db";
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
    description: "Search reviews, films and critics on CinePixo.",
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

  const [reviews, movies, critics] = q
    ? await Promise.all([
        prisma.review.findMany({
          where: {
            status: "PUBLISHED",
            OR: [{ title: ci(q) }, { excerpt: ci(q) }],
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
      ])
    : [[], [], []];

  const empty = q && reviews.length === 0 && movies.length === 0 && critics.length === 0;

  return (
    <div>
      <h1 className="text-2xl font-bold">Search</h1>
      <form action="/search" method="get" className="mt-4 flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder="Reviews, movies, critics…"
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

      {movies.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase text-muted">Movies</h2>
          <div className="mt-3 grid grid-cols-3 gap-4 sm:grid-cols-5">
            {movies.map((m) => (
              <Link key={m.id} href={`/movies/${m.slug}`} className="group">
                <Poster
                  path={m.posterPath}
                  title={m.title}
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
