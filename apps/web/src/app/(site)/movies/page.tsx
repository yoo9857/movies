import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Poster } from "@/components/Poster";
import { StarRating } from "@/components/StarRating";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Movies" };

export default async function MoviesPage() {
  const movies = await prisma.movie.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      posterPath: true,
      releaseDate: true,
      director: true,
      reviews: {
        where: { status: "PUBLISHED" },
        select: { rating: true },
      },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Movies</h1>
      <p className="mt-1 text-sm text-muted">Every film in the CinePixo library.</p>

      {movies.length === 0 ? (
        <p className="mt-8 text-muted">The library is empty.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {movies.map((m) => {
            const count = m.reviews.length;
            const avg = count > 0 ? m.reviews.reduce((s, r) => s + r.rating, 0) / count : null;
            return (
              <Link key={m.id} href={`/movies/${m.id}`} className="group">
                <Poster
                  path={m.posterPath}
                  title={m.title}
                  className="aspect-2/3 w-full rounded-lg border border-line transition-transform group-hover:scale-[1.02]"
                />
                <h2 className="mt-2 truncate text-sm font-medium group-hover:text-accent transition-colors">
                  {m.title}
                </h2>
                <p className="text-xs text-muted">
                  {m.releaseDate ? new Date(m.releaseDate).getFullYear() : ""}
                  {avg != null && (
                    <span className="ml-2 text-accent">
                      ★ {(Math.round((avg / 2) * 10) / 10).toFixed(1)}
                    </span>
                  )}
                  {count > 0 && <span className="ml-1">({count})</span>}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
