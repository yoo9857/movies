// The film under review, as a spec card inside the article — poster plus the
// facts a reader wants before the first paragraph. Built from the linked movie,
// so authors never retype it.
import Link from "next/link";
import { Poster } from "../Poster";

export interface FilmSpec {
  id: string;
  title: string;
  originalTitle: string | null;
  releaseDate: Date | string | null;
  runtime: number | null;
  certification: string | null;
  director: string | null;
  genres: string[];
  countries: string[];
  posterPath: string | null;
}

function runtimeLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function FilmSpecCard({ film }: { film: FilmSpec }) {
  const year = film.releaseDate ? new Date(film.releaseDate).getFullYear() : null;

  const rows: [string, string][] = [
    film.director ? ["Director", film.director] : null,
    film.genres.length ? ["Genre", film.genres.join(", ")] : null,
    film.runtime ? ["Runtime", runtimeLabel(film.runtime)] : null,
    film.certification ? ["Rated", film.certification] : null,
    film.countries.length ? ["Country", film.countries.join(", ")] : null,
  ].filter((r): r is [string, string] => r !== null);

  return (
    <aside className="flex gap-5 border-y border-line py-5">
      <Link href={`/movies/${film.id}`} className="shrink-0">
        <Poster
          path={film.posterPath}
          title={film.title}
          size="thumb"
          className="h-36 w-24 rounded-lg border border-line object-cover transition-opacity hover:opacity-90"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/movies/${film.id}`} className="group">
          <h2 className="text-lg font-bold leading-tight transition-colors group-hover:text-accent">
            {film.title}
            {year && <span className="ml-2 font-normal text-muted">({year})</span>}
          </h2>
        </Link>
        {film.originalTitle && film.originalTitle !== film.title && (
          <p className="font-mono text-[11px] text-muted">{film.originalTitle}</p>
        )}
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted sm:pt-1">
                {k}
              </dt>
              <dd className="min-w-0 truncate text-foreground/90">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
