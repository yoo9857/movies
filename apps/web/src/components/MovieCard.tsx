// Poster-first card for browsing the library. The poster does the work; the
// numbers ride on top of it so the card stays one object, not a stack of boxes.
import { toStarScale } from "@cinepixo/shared";
import Link from "next/link";
import { Poster } from "./Poster";

export interface MovieCardData {
  id: string;
  title: string;
  posterPath: string | null;
  releaseDate: Date | string | null;
  director: string | null;
  genres: string[];
  voteAverage: number | null;
  fandomAvg: number | null;
  reviewCount: number;
}

export function MovieCard({ movie, rank }: { movie: MovieCardData; rank?: number }) {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;
  const stars = movie.fandomAvg != null ? toStarScale(movie.fandomAvg) : null;

  return (
    <Link href={`/movies/${movie.id}`} className="group block">
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface-raised">
        <Poster
          path={movie.posterPath}
          title={movie.title}
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 190px"
          className="aspect-2/3 w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />

        {rank != null && (
          <span className="absolute left-0 top-0 rounded-br-lg bg-background/85 px-2 py-1 font-mono text-xs font-bold text-accent backdrop-blur">
            {String(rank).padStart(2, "0")}
          </span>
        )}

        {/* Score chip: fandom if we have it, otherwise the world's number,
            clearly labelled so the two are never confused. */}
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 font-mono text-[11px] backdrop-blur">
          {stars != null ? (
            <>
              <span className="text-accent">★ {stars.toFixed(1)}</span>
              <span className="text-muted">·{movie.reviewCount}</span>
            </>
          ) : movie.voteAverage != null ? (
            <span className="text-muted">TMDB {movie.voteAverage.toFixed(1)}</span>
          ) : (
            <span className="text-muted">unrated</span>
          )}
        </span>

        {/* Hover veil — extra context without making the resting card noisy */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-background via-background/70 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          {movie.genres.length > 0 && (
            <p className="font-mono text-[10px] uppercase tracking-wide text-accent">
              {movie.genres.slice(0, 3).join(" · ")}
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            {movie.reviewCount > 0
              ? `${movie.reviewCount} fandom review${movie.reviewCount === 1 ? "" : "s"}`
              : "No reviews yet — write the first"}
          </p>
        </div>
      </div>

      <h3 className="mt-2 truncate text-sm font-semibold transition-colors group-hover:text-accent">
        {movie.title}
      </h3>
      <p className="truncate font-mono text-[11px] text-muted">
        {[year, movie.director].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}
