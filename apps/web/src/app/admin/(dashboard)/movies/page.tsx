import { prisma } from "@cinepixo/db";
import Link from "next/link";
import { MovieArtworkButton } from "@/components/admin/MovieArtworkButton";
import { MovieImporter } from "@/components/admin/MovieImporter";
import { RefreshMovieButton } from "@/components/admin/RefreshMovieButton";
import { Poster } from "@/components/Poster";

export const dynamic = "force-dynamic";

/**
 * The desk's film table. It rendered the whole library in one <table> — fine at
 * twenty-one films, a 115,000-row page after the Wikidata import. Fifty rows a
 * page now, with a title search (served by the trigram index) because "page
 * 1,800 of 2,317" is not how anyone finds a film to fix.
 */
const PER_PAGE = 50;

export default async function AdminMoviesPage(props: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await props.searchParams;
  const q = (sp.q ?? "").slice(0, 80).trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const where = q ? { title: { contains: q, mode: "insensitive" as const } } : {};
  const [movies, total] = await Promise.all([
    prisma.movie.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        tmdbId: true,
        slug: true,
        title: true,
        posterPath: true,
        image: true,
        releaseDate: true,
        director: true,
        genres: true,
        _count: { select: { reviews: true } },
      },
    }),
    prisma.movie.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const tmdbConfigured = Boolean(process.env.TMDB_API_KEY);
  const pageHref = (p: number) =>
    `/admin/movies?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div>
      <h1 className="text-2xl font-bold">Movies</h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase text-muted">Import from TMDB</h2>
        {tmdbConfigured ? (
          <div className="mt-3">
            <MovieImporter />
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
            Set <code className="text-accent">TMDB_API_KEY</code> in{" "}
            <code>apps/web/.env.local</code> to enable TMDB search &amp; import.
          </p>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase text-muted">
            In library ({total.toLocaleString("en-US")})
          </h2>
          <form action="/admin/movies" className="flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search titles…"
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-dim"
            />
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent-dim">
              Search
            </button>
          </form>
        </div>

        {movies.length === 0 ? (
          <p className="mt-3 text-muted">{q ? `Nothing titled “${q}”.` : "No movies yet."}</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Poster</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Director</th>
                  <th className="px-4 py-3">Genres</th>
                  <th className="px-4 py-3">Reviews</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {movies.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="px-4 py-2">
                      <div className="w-10">
                        <Poster
                          path={m.posterPath}
                          image={m.image}
                          title={m.title}
                          size="thumb"
                          className="aspect-2/3 w-10 rounded"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/movies/${m.slug}`} className="hover:text-accent">
                        {m.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {m.releaseDate ? m.releaseDate.getFullYear() : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{m.director ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{m.genres.join(", ") || "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{m._count.reviews}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-3">
                        <MovieArtworkButton movieId={m.id} hasOwn={m.image != null} />
                        {m.tmdbId != null && <RefreshMovieButton tmdbId={m.tmdbId} />}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav className="mt-4 flex items-center gap-3 text-sm">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="text-accent hover:opacity-80">
                ← Prev
              </Link>
            )}
            <span className="font-mono text-xs text-muted">
              page {page.toLocaleString("en-US")} / {totalPages.toLocaleString("en-US")}
            </span>
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="text-accent hover:opacity-80">
                Next →
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
