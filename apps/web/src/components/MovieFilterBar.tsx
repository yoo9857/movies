import Link from "next/link";

/**
 * The browse controls, as three things instead of one wall.
 *
 * They used to be a single wrapping row: fourteen genre links, five decades,
 * four sorts and a view toggle, all the same size, separated by a pipe. Every
 * option had equal weight, so none of them read as answering a question — and
 * on a phone it wrapped into six lines of undifferentiated text.
 *
 * Three groups now, because there are three different questions:
 *
 *   · **which films** — genre and decade, as chips. A chip has an edge, so a
 *     selected one is obvious at a glance and an unselected one still looks
 *     pressable. They scroll sideways rather than wrapping, so the block is a
 *     fixed two rows however many genres exist.
 *   · **in what order** — a segmented control, because sort is one-of-N and
 *     short. Segments make the alternatives visible without reading them as
 *     more filters.
 *   · **how it looks** — the view toggle, pushed away from both.
 *
 * Plus the thing the old rail had no room for: a line saying what is currently
 * applied, with a way to undo it. "9 films · Drama · 1990s [Clear]" answers
 * "why am I seeing so few?" without making anyone re-read the chips.
 *
 * Still links, not a client component. Each filter combination is its own
 * indexable URL — that is deliberate (see canonicalPath) and a `<select>` with
 * JavaScript would throw it away.
 */

export interface FilterBarProps {
  genres: readonly string[];
  decades: readonly number[];
  sorts: Readonly<Record<string, string>>;
  activeGenre: string;
  activeDecade: number | null;
  activeSort: string;
  activeView: "grid" | "index";
  total: number;
  page: number;
  totalPages: number;
  /** Builds a URL with these params patched over the current state. */
  href: (patch: Record<string, string | undefined>) => string;
}

const chip =
  "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors whitespace-nowrap";
const chipOff = "border-line text-muted hover:border-accent-dim hover:text-foreground";
const chipOn = "border-accent bg-accent text-black font-semibold";

const groupLabel = "font-mono text-[10px] uppercase tracking-[0.16em] text-muted";

export function MovieFilterBar({
  genres,
  decades,
  sorts,
  activeGenre,
  activeDecade,
  activeSort,
  activeView,
  total,
  page,
  totalPages,
  href,
}: FilterBarProps) {
  const filtered = Boolean(activeGenre) || activeDecade != null;

  return (
    <div className="mt-6 space-y-4 border-y border-line py-4">
      {/* What you are looking at, and how to stop. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className="font-mono text-xs text-muted">
          {total.toLocaleString("en-US")} film{total === 1 ? "" : "s"}
          {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
        </span>
        {activeGenre && (
          <Link
            href={href({ genre: undefined, page: undefined })}
            className="group inline-flex items-center gap-1.5 rounded-full border border-accent-dim bg-accent/10 px-2.5 py-0.5 text-xs text-accent"
          >
            {activeGenre}
            <span aria-hidden="true" className="opacity-60 group-hover:opacity-100">
              ✕
            </span>
            <span className="sr-only">Remove genre filter</span>
          </Link>
        )}
        {activeDecade != null && (
          <Link
            href={href({ decade: undefined, page: undefined })}
            className="group inline-flex items-center gap-1.5 rounded-full border border-accent-dim bg-accent/10 px-2.5 py-0.5 font-mono text-xs text-accent"
          >
            {activeDecade}s
            <span aria-hidden="true" className="opacity-60 group-hover:opacity-100">
              ✕
            </span>
            <span className="sr-only">Remove decade filter</span>
          </Link>
        )}
        {filtered && (
          <Link
            href={href({ genre: undefined, decade: undefined, page: undefined })}
            className="ml-auto text-xs text-muted underline underline-offset-2 hover:text-foreground"
          >
            Clear filters
          </Link>
        )}
      </div>

      {/* Which films */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className={groupLabel}>Genre</span>
          <div className="cx-rail flex gap-1.5 pb-1">
            <Link
              href={href({ genre: undefined, page: undefined })}
              aria-current={!activeGenre ? "true" : undefined}
              className={`${chip} ${!activeGenre ? chipOn : chipOff}`}
            >
              All
            </Link>
            {genres.map((g) => {
              const on = g === activeGenre;
              return (
                <Link
                  key={g}
                  href={href({ genre: on ? undefined : g, page: undefined })}
                  aria-current={on ? "true" : undefined}
                  className={`${chip} ${on ? chipOn : chipOff}`}
                >
                  {g}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={groupLabel}>Decade</span>
          <div className="cx-rail flex gap-1.5 pb-1">
            <Link
              href={href({ decade: undefined, page: undefined })}
              aria-current={activeDecade == null ? "true" : undefined}
              className={`${chip} font-mono ${activeDecade == null ? chipOn : chipOff}`}
            >
              Any
            </Link>
            {decades.map((d) => {
              const on = d === activeDecade;
              return (
                <Link
                  key={d}
                  href={href({ decade: on ? undefined : String(d), page: undefined })}
                  aria-current={on ? "true" : undefined}
                  className={`${chip} font-mono ${on ? chipOn : chipOff}`}
                >
                  {d}s
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* In what order, and how it looks */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={groupLabel}>Sort</span>
        <div
          role="group"
          aria-label="Sort order"
          className="inline-flex overflow-hidden rounded-lg border border-line"
        >
          {Object.entries(sorts).map(([key, label], i) => {
            const on = key === activeSort;
            return (
              <Link
                key={key}
                href={href({ sort: key })}
                aria-current={on ? "true" : undefined}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  i > 0 ? "border-l border-line" : ""
                } ${on ? "bg-accent text-black" : "text-muted hover:bg-surface hover:text-foreground"}`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <Link
          href={href({ view: activeView === "grid" ? "index" : undefined })}
          className="ml-auto rounded-lg border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:border-accent-dim hover:text-foreground"
        >
          {activeView === "grid" ? "⊟ Compare" : "⊞ Posters"}
        </Link>
      </div>
    </div>
  );
}
