import { prisma } from "@cinepixo/db";
import { parseJsonArray } from "@cinepixo/shared";
import { MovieImporter } from "@/components/admin/MovieImporter";

export const dynamic = "force-dynamic";

export default async function AdminMoviesPage() {
  const movies = await prisma.movie.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      tmdbId: true,
      title: true,
      releaseDate: true,
      director: true,
      genres: true,
      _count: { select: { reviews: true } },
    },
  });

  const tmdbConfigured = Boolean(process.env.TMDB_API_KEY);

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
        <h2 className="text-sm font-semibold uppercase text-muted">
          In library ({movies.length})
        </h2>
        {movies.length === 0 ? (
          <p className="mt-3 text-muted">No movies yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Director</th>
                  <th className="px-4 py-3">Genres</th>
                  <th className="px-4 py-3">Reviews</th>
                </tr>
              </thead>
              <tbody>
                {movies.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">{m.title}</td>
                    <td className="px-4 py-3 text-muted">
                      {m.releaseDate ? m.releaseDate.getFullYear() : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{m.director ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {parseJsonArray(m.genres).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted">{m._count.reviews}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
