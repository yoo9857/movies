import { prisma } from "@cinepixo/db";
import { parseJsonArray, toStarScale } from "@cinepixo/shared";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Poster } from "@/components/Poster";
import { RatingHistogram } from "@/components/RatingHistogram";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Movies" };

const SORTS = {
  fandom: "Fandom rating",
  reviews: "Most reviewed",
  recent: "Recently added",
  year: "Release year",
} as const;
type SortKey = keyof typeof SORTS;

export default async function MoviesPage(props: {
  searchParams: Promise<{ genre?: string; decade?: string; sort?: string; view?: string }>;
}) {
  const sp = await props.searchParams;
  const genre = (sp.genre ?? "").slice(0, 40);
  const decade = /^\d{4}$/.test(sp.decade ?? "") ? Number(sp.decade) : null;
  const sort: SortKey = (Object.keys(SORTS) as SortKey[]).includes(sp.sort as SortKey)
    ? (sp.sort as SortKey)
    : "fandom";
  const view = sp.view === "grid" ? "grid" : "index";

  const rows = await prisma.movie.findMany({
    select: {
      id: true,
      title: true,
      posterPath: true,
      backdropPath: true,
      releaseDate: true,
      director: true,
      genres: true,
      voteAverage: true,
      createdAt: true,
      reviews: { where: { status: "PUBLISHED" }, select: { rating: true } },
    },
  });

  const allGenres = Array.from(new Set(rows.flatMap((m) => parseJsonArray(m.genres)))).sort();
  const decades = Array.from(
    new Set(
      rows
        .map((m) => (m.releaseDate ? Math.floor(m.releaseDate.getFullYear() / 10) * 10 : null))
        .filter((d): d is number => d != null),
    ),
  ).sort((a, b) => b - a);

  let movies = rows.map((m) => {
    const count = m.reviews.length;
    const avg = count > 0 ? m.reviews.reduce((s, r) => s + r.rating, 0) / count : null;
    return { ...m, count, avg, ratings: m.reviews.map((r) => r.rating) };
  });

  if (genre) movies = movies.filter((m) => parseJsonArray(m.genres).includes(genre));
  if (decade != null) {
    movies = movies.filter(
      (m) =>
        m.releaseDate &&
        Math.floor(m.releaseDate.getFullYear() / 10) * 10 === decade,
    );
  }

  movies.sort((a, b) => {
    switch (sort) {
      case "reviews":
        return b.count - a.count;
      case "recent":
        return b.createdAt.getTime() - a.createdAt.getTime();
      case "year":
        return (b.releaseDate?.getTime() ?? 0) - (a.releaseDate?.getTime() ?? 0);
      default:
        return (b.avg ?? -1) - (a.avg ?? -1) || b.count - a.count;
    }
  });

  // Editor's pick: most reviewed among the current filter
  const featured =
    view === "index" && !genre && decade == null
      ? [...movies].sort((a, b) => b.count - a.count)[0]
      : null;
  const listed = featured ? movies.filter((m) => m.id !== featured.id) : movies;

  const qs = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { genre, decade: decade?.toString(), sort, view, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === "sort" && v === "fandom") && !(k === "view" && v === "index"))
        params.set(k, v);
    }
    const s = params.toString();
    return s ? `/movies?${s}` : "/movies";
  };

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Movies</h1>

      {/* Filter rail — text links on a hairline, no dropdown boxes */}
      <nav
        className="mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-2 border-y border-line py-3 text-sm"
        aria-label="Filters"
      >
        <Link
          href={qs({ genre: undefined })}
          className={!genre ? "font-semibold text-accent underline underline-offset-4" : "text-muted hover:text-foreground"}
        >
          All
        </Link>
        {allGenres.map((g) => (
          <Link
            key={g}
            href={qs({ genre: g === genre ? undefined : g })}
            className={
              g === genre
                ? "font-semibold text-accent underline underline-offset-4"
                : "text-muted hover:text-foreground"
            }
          >
            {g}
          </Link>
        ))}
        <span className="mx-1 hidden text-line sm:inline">|</span>
        {decades.map((d) => (
          <Link
            key={d}
            href={qs({ decade: d === decade ? undefined : String(d) })}
            className={
              d === decade
                ? "font-mono font-semibold text-accent underline underline-offset-4"
                : "font-mono text-muted hover:text-foreground"
            }
          >
            {d}s
          </Link>
        ))}
        <span className="ml-auto flex items-baseline gap-4">
          {(Object.entries(SORTS) as [SortKey, string][]).map(([k, label]) => (
            <Link
              key={k}
              href={qs({ sort: k })}
              className={
                k === sort
                  ? "font-mono text-xs uppercase tracking-wide text-accent"
                  : "font-mono text-xs uppercase tracking-wide text-muted hover:text-foreground"
              }
            >
              {label}
            </Link>
          ))}
          <Link
            href={qs({ view: view === "grid" ? undefined : "grid" })}
            className="font-mono text-xs uppercase tracking-wide text-muted hover:text-foreground"
            aria-label="Toggle view"
          >
            {view === "grid" ? "⊟ Index" : "⊞ Grid"}
          </Link>
        </span>
      </nav>

      {/* Editor's pick — asymmetric entry before the index */}
      {featured && featured.count > 0 && (
        <Link
          href={`/movies/${featured.id}`}
          className="group relative mt-8 block overflow-hidden rounded-2xl border border-line"
        >
          <div className="relative min-h-[13rem]">
            {featured.backdropPath ? (
              <Image
                src={`https://image.tmdb.org/t/p/w780${featured.backdropPath}`}
                alt=""
                fill
                className="object-cover opacity-30 transition-opacity group-hover:opacity-40"
              />
            ) : (
              <div className="absolute inset-0 bg-surface" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />
            <div className="relative flex min-h-[13rem] items-end gap-5 p-6">
              <Poster
                path={featured.posterPath}
                title={featured.title}
                className="hidden w-24 rounded-lg border border-line shadow-xl sm:block"
              />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                  Most discussed
                </p>
                <h2 className="mt-1 text-2xl font-bold group-hover:text-accent transition-colors">
                  {featured.title}
                  {featured.releaseDate && (
                    <span className="ml-2 font-normal text-muted">
                      ({featured.releaseDate.getFullYear()})
                    </span>
                  )}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {featured.avg != null && (
                    <span className="font-mono text-accent">
                      ★ {toStarScale(featured.avg).toFixed(1)}
                    </span>
                  )}{" "}
                  · {featured.count} review{featured.count === 1 ? "" : "s"}
                  {featured.director ? ` · ${featured.director}` : ""}
                </p>
              </div>
            </div>
          </div>
        </Link>
      )}

      {listed.length === 0 ? (
        <p className="mt-10 text-muted">Nothing matches this filter.</p>
      ) : view === "grid" ? (
        /* Poster grid — secondary view */
        <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {listed.map((m) => (
            <Link key={m.id} href={`/movies/${m.id}`} className="group">
              <Poster
                path={m.posterPath}
                title={m.title}
                className="aspect-2/3 w-full rounded-lg border border-line transition-transform group-hover:scale-[1.02]"
              />
              <h2 className="mt-2 truncate text-sm font-medium group-hover:text-accent transition-colors">
                {m.title}
              </h2>
              <p className="font-mono text-xs text-muted">
                {m.releaseDate ? m.releaseDate.getFullYear() : ""}
                {m.avg != null && (
                  <span className="ml-2 text-accent">★ {toStarScale(m.avg).toFixed(1)}</span>
                )}
                {m.count > 0 && <span className="ml-1">({m.count})</span>}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        /* Credits-roll index — default view */
        <div className="mt-8 border-t border-line">
          {listed.map((m, i) => (
            <Link
              key={m.id}
              href={`/movies/${m.id}`}
              className="group grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-line py-3.5 pl-1 pr-2 transition-colors hover:bg-surface/60 sm:grid-cols-[3rem_minmax(0,1fr)_8rem_auto]"
            >
              <span className="font-mono text-lg text-muted tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="font-semibold group-hover:text-accent transition-colors">
                  {m.title}
                </span>
                <span className="text-sm text-muted">
                  {m.releaseDate ? ` (${m.releaseDate.getFullYear()})` : ""}
                  {m.director ? ` · ${m.director}` : ""}
                  {parseJsonArray(m.genres).length > 0
                    ? ` · ${parseJsonArray(m.genres).slice(0, 3).join(", ")}`
                    : ""}
                </span>
              </span>
              <span className="hidden sm:block">
                {m.count > 0 && <RatingHistogram ratings={m.ratings} height={22} />}
              </span>
              <span className="text-right">
                <span className="font-mono text-sm tabular-nums">
                  {m.avg != null ? (
                    <span className="text-accent">★ {toStarScale(m.avg).toFixed(1)}</span>
                  ) : (
                    <span className="text-muted">unrated</span>
                  )}
                </span>
                <span className="block font-mono text-[11px] text-muted">
                  {m.voteAverage != null ? `TMDB ${m.voteAverage.toFixed(1)}` : ""}
                  {m.count > 0 ? ` · ${m.count} rev` : ""}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
