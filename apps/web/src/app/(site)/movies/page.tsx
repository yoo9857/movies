import { prisma } from "@cinepixo/db";
import { toStarScale } from "@cinepixo/shared";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { MovieCard } from "@/components/MovieCard";
import { MovieFilterBar } from "@/components/MovieFilterBar";
import { Poster } from "@/components/Poster";
import { RatingHistogram } from "@/components/RatingHistogram";
import {
  breadcrumbNode,
  type Crumb,
  graph,
  itemListNode,
  movieEntityId,
  pageMetadata,
  posterUrl,
  webPageNode,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

const SORTS = {
  fandom: "Fandom rating",
  reviews: "Most reviewed",
  recent: "Recently added",
  year: "Release year",
} as const;
type SortKey = keyof typeof SORTS;

/**
 * Canonical path for a browse state.
 *
 * Genre, decade and page change *which* films are listed, so each earns its own
 * indexable URL. Sort order and grid-vs-index only rearrange the same films, so
 * they canonicalise away — otherwise every genre would present as eight
 * near-identical pages competing with one another.
 */
function canonicalPath(genre: string, decade: number | null, page: number): string {
  const params = new URLSearchParams();
  if (genre) params.set("genre", genre);
  if (decade != null) params.set("decade", String(decade));
  if (page > 1) params.set("page", String(page));
  const q = params.toString();
  return q ? `/movies?${q}` : "/movies";
}

function listTitle(genre: string, decade: number | null): string {
  if (genre && decade != null) return `${genre} films of the ${decade}s`;
  if (genre) return `${genre} films`;
  if (decade != null) return `Films of the ${decade}s`;
  return "Movies";
}

function readParams(sp: {
  genre?: string;
  decade?: string;
  page?: string;
}): { genre: string; decade: number | null; page: number } {
  return {
    genre: (sp.genre ?? "").slice(0, 40),
    decade: /^\d{4}$/.test(sp.decade ?? "") ? Number(sp.decade) : null,
    page: Math.max(1, Math.min(500, Number(sp.page) || 1)),
  };
}

export async function generateMetadata(props: {
  searchParams: Promise<{ genre?: string; decade?: string; page?: string }>;
}): Promise<Metadata> {
  const { genre, decade, page } = readParams(await props.searchParams);
  const base = listTitle(genre, decade);
  const scope = [genre ? genre.toLowerCase() : null, decade != null ? `the ${decade}s` : null]
    .filter(Boolean)
    .join(" from ");

  return pageMetadata({
    path: canonicalPath(genre, decade, page),
    title: page > 1 ? `${base} — page ${page}` : base,
    description: scope
      ? `Films ${scope} in the CinePixo library — full credits, and the criticism written about each one.`
      : "The CinePixo film library — full credits for every film, and the criticism written about it.",
    keywords: [genre, decade != null ? `${decade}s films` : "", "film library"].filter(Boolean),
  });
}

/**
 * The facet bars, and the counts pagination is built on — cached.
 *
 * Genres and decades are `DISTINCT` scans over the whole library for two lists
 * that change roughly never (a new decade arrives once every ten years); an hour
 * stale costs nothing. Counts are a `COUNT(*)` per (genre, decade) selection —
 * over 115,000 rows for the unfiltered view — and drive `totalPages` and a
 * display total, neither of which needs to track the import scripts minute by
 * minute. Keyed by arguments, so every filter combination counts once per
 * revalidation window instead of once per visitor.
 */
const facetLists = unstable_cache(
  async () => {
    const [genreRows, yearRows] = await Promise.all([
      prisma.$queryRawUnsafe<{ genre: string }[]>(
        `SELECT DISTINCT UNNEST("genres") AS genre FROM "Movie" ORDER BY genre`,
      ),
      prisma.$queryRawUnsafe<{ decade: number }[]>(
        `SELECT DISTINCT (EXTRACT(YEAR FROM "releaseDate")::int / 10) * 10 AS decade
         FROM "Movie" WHERE "releaseDate" IS NOT NULL ORDER BY decade DESC`,
      ),
    ]);
    return {
      genres: genreRows.map((g) => g.genre),
      decades: yearRows.map((d) => Number(d.decade)),
    };
  },
  ["movies-facets"],
  { revalidate: 3600 },
);

const filteredCount = unstable_cache(
  (genre: string, decade: number | null) =>
    prisma.movie.count({
      where: {
        ...(genre ? { genres: { has: genre } } : {}),
        ...(decade != null
          ? {
              releaseDate: {
                gte: new Date(Date.UTC(decade, 0, 1)),
                lt: new Date(Date.UTC(decade + 10, 0, 1)),
              },
            }
          : {}),
      },
    }),
  ["movies-filtered-count"],
  { revalidate: 600 },
);

export default async function MoviesPage(props: {
  searchParams: Promise<{
    genre?: string;
    decade?: string;
    sort?: string;
    view?: string;
    page?: string;
  }>;
}) {
  const sp = await props.searchParams;
  const genre = (sp.genre ?? "").slice(0, 40);
  const decade = /^\d{4}$/.test(sp.decade ?? "") ? Number(sp.decade) : null;
  const sort: SortKey = (Object.keys(SORTS) as SortKey[]).includes(sp.sort as SortKey)
    ? (sp.sort as SortKey)
    : "fandom";
  // Posters are the default: a film library is browsed by sight. The dense
  // index stays available for anyone comparing numbers.
  const view = sp.view === "index" ? "index" : "grid";

  const page = Math.max(1, Math.min(500, Number(sp.page) || 1));
  const PER_PAGE = 30;

  // Filters run in the database — genres is a text[] with a GIN index, so this
  // stays a single indexed lookup however large the library gets. Loading every
  // row to filter in JavaScript worked at nine films and would not at nine
  // hundred.
  const where = {
    ...(genre ? { genres: { has: genre } } : {}),
    ...(decade != null
      ? {
          releaseDate: {
            gte: new Date(Date.UTC(decade, 0, 1)),
            lt: new Date(Date.UTC(decade + 10, 0, 1)),
          },
        }
      : {}),
  };

  const orderBy =
    sort === "recent"
      ? [{ createdAt: "desc" as const }]
      : sort === "year"
        ? [{ releaseDate: "desc" as const }]
        : sort === "reviews"
          ? [{ reviews: { _count: "desc" as const } }]
          : // "fandom": no rating column to sort on, so order by review volume
            // and refine within the page below
            [{ reviews: { _count: "desc" as const } }, { voteAverage: "desc" as const }];

  const select = {
    id: true,
    slug: true,
    title: true,
    posterPath: true,
    image: true,
    backdropPath: true,
    releaseDate: true,
    director: true,
    genres: true,
    voteAverage: true,
    createdAt: true,
    reviews: { where: { status: "PUBLISHED" as const }, select: { rating: true } },
  };

  // Facet lists come from distinct values, not from every row's payload — and
  // both they and the selection count are cached above.
  const [total, rows, facets] = await Promise.all([
    filteredCount(genre, decade),
    prisma.movie.findMany({
      where,
      orderBy,
      select,
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    facetLists(),
  ]);

  const allGenres = facets.genres;
  const decades = facets.decades;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const withScores = rows.map((m) => {
    const count = m.reviews.length;
    const avg = count > 0 ? m.reviews.reduce((s, r) => s + r.rating, 0) / count : null;
    return { ...m, count, avg, ratings: m.reviews.map((r) => r.rating) };
  });

  // Fandom average is derived, so the final ordering happens on the page slice.
  const movies =
    sort === "fandom"
      ? [...withScores].sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || b.count - a.count)
      : withScores;

  // Editor's pick banner: first page of an unfiltered view only, and only once
  // the library is big enough that pulling one film out doesn't thin the grid.
  const featured =
    !genre && decade == null && page === 1 && total >= 6
      ? ([...movies].sort((a, b) => b.count - a.count).find((m) => m.count > 0) ?? null)
      : null;
  const listed = featured ? movies.filter((m) => m.id !== featured.id) : movies;

  const qs = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    // Changing a filter or the sort returns to page 1; only an explicit page
    // patch carries a page through.
    const merged: Record<string, string | undefined> = {
      genre,
      decade: decade?.toString(),
      sort,
      view,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue;
      if (k === "sort" && v === "fandom") continue;
      if (k === "view" && v === "grid") continue;
      if (k === "page" && v === "1") continue;
      params.set(k, v);
    }
    const s = params.toString();
    return s ? `/movies?${s}` : "/movies";
  };

  const cardData = (m: (typeof listed)[number]) => ({
    id: m.id,
    slug: m.slug,
    title: m.title,
    posterPath: m.posterPath,
    image: m.image,
    releaseDate: m.releaseDate,
    director: m.director,
    genres: m.genres,
    fandomAvg: m.avg,
    reviewCount: m.count,
  });

  const path = canonicalPath(genre, decade, page);
  const heading = listTitle(genre, decade);
  const trail: Crumb[] = [
    { name: "Movies", path: "/movies" },
    ...(genre || decade != null ? [{ name: heading }] : []),
  ];

  const jsonLd = graph(
    webPageNode({
      path,
      name: page > 1 ? `${heading} — page ${page}` : heading,
      description: "Films in the CinePixo library, with the criticism written about each one.",
      kind: "CollectionPage",
      hasBreadcrumb: true,
      keywords: [genre, decade != null ? `${decade}s` : ""].filter(Boolean),
    }),
    breadcrumbNode(path, trail),
    listed.length > 0 &&
      itemListNode({
        path,
        name: heading,
        startAt: (page - 1) * PER_PAGE + 1,
        totalItems: total,
        entries: listed.map((m) => ({
          path: `/movies/${m.slug}`,
          name: m.title,
          image: posterUrl(m.posterPath, "w342"),
          entityId: movieEntityId(m.slug),
        })),
      }),
  );

  return (
    <div>
      <JsonLd data={jsonLd} />
      {trail.length > 1 && (
        <div className="mb-4">
          <Breadcrumbs trail={trail} />
        </div>
      )}
      <h1 className="text-3xl font-bold tracking-tight">{heading}</h1>

      <MovieFilterBar
        genres={allGenres}
        decades={decades}
        sorts={SORTS}
        activeGenre={genre}
        activeDecade={decade}
        activeSort={sort}
        activeView={view}
        total={total}
        page={page}
        totalPages={totalPages}
        href={qs}
      />

      {/* Editor's pick — asymmetric entry before the index */}
      {featured && featured.count > 0 && (
        <Link
          href={`/movies/${featured.slug}`}
          className="group relative mt-8 block overflow-hidden rounded-2xl border border-line"
        >
          <div className="relative min-h-[13rem]">
            {featured.backdropPath ? (
              <Image
                src={`https://image.tmdb.org/t/p/w780${featured.backdropPath}`}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 1024px"
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
        /* Poster grid — the default way to browse */
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {listed.map((m, i) => (
            <MovieCard
              key={m.id}
              movie={cardData(m)}
              rank={sort === "fandom" && m.count > 0 ? i + 1 : undefined}
            />
          ))}
        </div>
      ) : (
        /* Credits-roll index — default view */
        <div className="mt-8 border-t border-line">
          {listed.map((m, i) => (
            <Link
              key={m.id}
              href={`/movies/${m.slug}`}
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
                  {m.genres.length > 0
                    ? ` · ${m.genres.slice(0, 3).join(", ")}`
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
                    <span className="text-muted">unread</span>
                  )}
                </span>
                <span className="block font-mono text-[11px] text-muted">
                  {m.count > 0
                    ? `${m.count} review${m.count === 1 ? "" : "s"}`
                    : "no reviews yet"}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav
          className="mt-10 flex items-baseline justify-between font-mono text-sm"
          aria-label="Pagination"
        >
          {page > 1 ? (
            <Link
              href={qs({ page: String(page - 1) })}
              className="text-muted transition-colors hover:text-foreground"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted tabular-nums">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={qs({ page: String(page + 1) })}
              className="text-muted transition-colors hover:text-foreground"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
