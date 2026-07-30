import { toStarScale } from "@cinepixo/shared";
import Link from "next/link";

/**
 * How this site's readers actually rate the work — the part no encyclopedia has.
 *
 * A career average alone hides the shape of a career, so each film gets a bar
 * against the same scale and the extremes are named. Films nobody here has
 * written about are listed rather than dropped: the gap in the record is
 * information too, and quietly omitting them would make the average look more
 * authoritative than it is.
 */

export interface RatedFilm {
  slug: string;
  title: string;
  year: number | null;
  average: number | null;
  reviewCount: number;
}

export function PersonStats({ films }: { films: RatedFilm[] }) {
  const rated = films.filter((f) => f.average != null);
  if (rated.length === 0) return null;

  const values = rated.map((f) => f.average as number);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const best = rated.reduce((a, b) => ((b.average as number) > (a.average as number) ? b : a));
  const worst = rated.reduce((a, b) => ((b.average as number) < (a.average as number) ? b : a));
  const unrated = films.length - rated.length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          How it rates here
        </h2>
        <p className="font-mono text-[11px] text-muted">
          {rated.length} of {films.length} film{films.length === 1 ? "" : "s"} reviewed
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Average</p>
          <p className="text-3xl font-bold text-accent">{toStarScale(mean).toFixed(2)}</p>
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Best received
          </p>
          <Link
            href={`/movies/${best.slug}`}
            className="block truncate text-sm hover:text-accent"
          >
            {best.title}
            <span className="ml-1.5 font-mono text-xs text-accent">
              {toStarScale(best.average as number).toFixed(1)}
            </span>
          </Link>
        </div>
        {worst.slug !== best.slug && (
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Least received
            </p>
            <Link
              href={`/movies/${worst.slug}`}
              className="block truncate text-sm hover:text-accent"
            >
              {worst.title}
              <span className="ml-1.5 font-mono text-xs text-muted">
                {toStarScale(worst.average as number).toFixed(1)}
              </span>
            </Link>
          </div>
        )}
      </div>

      {/* One bar per film, oldest first, so the row reads as a career. */}
      <div className="mt-5 space-y-1.5">
        {[...films]
          .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
          .map((f) => {
            const stars = f.average != null ? toStarScale(f.average) : null;
            return (
              <Link
                key={f.slug}
                href={`/movies/${f.slug}`}
                className="group grid grid-cols-[3rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm"
              >
                <span className="font-mono text-[11px] text-muted tabular-nums">
                  {f.year ?? "—"}
                </span>
                <span className="relative h-5 overflow-hidden rounded bg-surface-raised">
                  {stars != null ? (
                    <span
                      className="absolute inset-y-0 left-0 rounded bg-accent/70 transition-colors group-hover:bg-accent"
                      style={{ width: `${(stars / 5) * 100}%` }}
                    />
                  ) : null}
                  <span
                    className={`absolute inset-y-0 left-2 flex items-center truncate pr-2 text-xs ${
                      stars != null ? "text-black/85 font-medium" : "text-muted"
                    }`}
                  >
                    {f.title}
                    {stars == null && " — unreviewed"}
                  </span>
                </span>
                <span className="text-right font-mono text-[11px] tabular-nums text-muted">
                  {stars != null ? stars.toFixed(1) : "—"}
                </span>
              </Link>
            );
          })}
      </div>

      {unrated > 0 && (
        <p className="mt-3 text-xs text-muted">
          {unrated} film{unrated === 1 ? " has" : "s have"} no review here yet —{" "}
          <Link href="/write" className="text-accent hover:opacity-80">
            the average only covers what has been written
          </Link>
          .
        </p>
      )}
    </section>
  );
}
