import { prisma } from "@cinepixo/db";
import { toStarScale } from "@cinepixo/shared";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { BillboardMedia } from "@/components/BillboardMedia";
import { JsonLd } from "@/components/JsonLd";
import { Poster } from "@/components/Poster";
import { Rail } from "@/components/Rail";
import { PostRow } from "@/components/blog/PostRow";
import { StarRating } from "@/components/StarRating";
import {
  blogNode,
  graph,
  hosted,
  itemListNode,
  pageMetadata,
  posterUrl,
  reviewEntityId,
  webPageNode,
} from "@/lib/seo";

/** Newest of a set of maybe-dates. The front page mixes two kinds of writing. */
const newest = (dates: (Date | null | undefined)[]): Date | undefined =>
  dates.reduce<Date | undefined>((a, d) => (d && (!a || d > a) ? d : a), undefined);
import { SITE_ABOUT, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  path: "/",
  // The home page names itself rather than taking the `%s · CinePixo` template.
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  absoluteTitle: true,
  description:
    "Long-form film criticism, written and signed: reviews scored in half-stars, films with full credits, and the critics whose work set the standard.",
  // No `images`: app/opengraph-image.png is picked up by the file convention,
  // which generates the absolute URL and dimensions itself.
});

/**
 * The shelf's newest twelve, and the stat tiles' four counts — cached.
 *
 * The first version of this page selected *every* movie with its reviews joined
 * and sliced twelve in JS, which was fine at 60 films and a 1.5s full-table scan
 * at 115,000. The rails only ever show a handful of rows, so a handful of rows
 * is what gets asked for; the counts change by the minute while imports run, but
 * nobody needs them to — ten minutes stale is still an honest number.
 *
 * `unstable_cache` serializes through JSON, so anything date-shaped comes back a
 * string; consumers re-wrap with `new Date()` where they need a year.
 */
const libraryRail = unstable_cache(
  () =>
    prisma.movie.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        slug: true,
        title: true,
        posterPath: true,
        image: true,
        releaseDate: true,
        genres: true,
        reviews: { where: { status: "PUBLISHED" }, select: { rating: true } },
      },
    }),
  ["home-library-rail"],
  { revalidate: 300 },
);

/**
 * Top rated, computed where the reviews are.
 *
 * Grouping Review by movie is bounded by how many films have been written
 * about — a number that grows at the speed of criticism, not of imports. The
 * weighting (shrunk toward the mean by `n / (n + 2)`) is unchanged; only the
 * 115,000-row detour to compute it is gone.
 */
const topRatedRail = unstable_cache(
  async () => {
    const grouped = await prisma.review.groupBy({
      by: ["movieId"],
      where: { status: "PUBLISHED" },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const ranked = grouped
      .map((g) => ({
        movieId: g.movieId,
        n: g._count._all,
        avg: g._avg.rating ?? 0,
        weighted: (g._avg.rating ?? 0) * (g._count._all / (g._count._all + 2)),
      }))
      .sort((a, b) => b.weighted - a.weighted)
      .slice(0, 10);
    if (ranked.length === 0) return [];
    const movies = await prisma.movie.findMany({
      where: { id: { in: ranked.map((r) => r.movieId) } },
      select: { id: true, slug: true, title: true, posterPath: true, image: true },
    });
    const byId = new Map(movies.map((m) => [m.id, m]));
    return ranked.flatMap((r) => {
      const m = byId.get(r.movieId);
      return m ? [{ ...m, n: r.n, avg: r.avg }] : [];
    });
  },
  ["home-top-rated"],
  { revalidate: 300 },
);

const siteCounts = unstable_cache(
  () =>
    Promise.all([
      prisma.review.count({ where: { status: "PUBLISHED" } }),
      prisma.movie.count(),
      prisma.critic.count(),
      prisma.user.count(),
    ]),
  ["home-site-counts"],
  { revalidate: 600 },
);

const reviewSelect = {
  slug: true,
  title: true,
  excerpt: true,
  rating: true,
  publishedAt: true,
  author: { select: { username: true, displayName: true } },
  movie: {
    select: {
      id: true,
      slug: true,
      title: true,
      posterPath: true,
      image: true,
      backdropPath: true,
      releaseDate: true,
      director: true,
      trailerKey: true,
      trailerFile: true,
    },
  },
} as const;

export default async function HomePage() {
  const [latest, posts, shelf, topRated, critics, counts] = await Promise.all([
    prisma.review.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 14,
      select: reviewSelect,
    }),
    prisma.post.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 4,
      select: {
        slug: true,
        title: true,
        dek: true,
        category: true,
        format: true,
        publishedAt: true,
        image: true,
        imageAlt: true,
        author: { select: { username: true, displayName: true } },
      },
    }),
    libraryRail(),
    topRatedRail(),
    prisma.critic.findMany({ orderBy: { name: "asc" }, take: 12 }),
    siteCounts(),
  ]);

  // Billboard: newest review whose film can actually dress the stage — our own
  // artwork with a trailer to play behind it beats artwork alone beats neither.
  // (The old test keyed on TMDB paths, which nothing renders any more.)
  const billboard =
    latest.find((r) => r.movie.image && (r.movie.trailerFile || r.movie.trailerKey)) ??
    latest.find((r) => r.movie.image) ??
    latest[0] ??
    null;
  const lead = latest.find((r) => r !== billboard && r.excerpt) ?? null;
  const railReviews = latest.filter((r) => r !== billboard && r !== lead).slice(0, 10);

  const [reviewCount, movieCount, criticCount, memberCount] = counts;

  // The home page's job in the graph is to be the front door: it states what the
  // site is, then hands over an ordered list of the newest criticism so a crawler
  // has somewhere to go next. No breadcrumb — Home is the root of every trail.
  const jsonLd = graph(
    webPageNode({
      path: "/",
      name: `${SITE_NAME} — ${SITE_TAGLINE}`,
      description: SITE_ABOUT,
      kind: "CollectionPage",
      // The newest thing on the page, whichever kind it is. Reporting only the
      // newest review told crawlers nothing had changed on a day the front page
      // gained a blog section.
      dateModified: newest([latest[0]?.publishedAt, posts[0]?.publishedAt]),
    }),
    // The blog as a publication. No second ItemList: `itemListNode` derives its
    // `@id` from the path, so two on "/" would collide — and the reviews list is
    // the one this page is primarily an index of.
    posts.length > 0 && blogNode(),
    latest.length > 0 &&
      itemListNode({
        path: "/",
        name: "Latest reviews",
        description: "The most recently published reviews on CinePixo.",
        totalItems: reviewCount,
        entries: latest.map((r) => ({
          path: `/reviews/${r.slug}`,
          name: r.title,
          image: hosted(r.movie.image) ?? posterUrl(r.movie.posterPath, "w342"),
          entityId: reviewEntityId(r.slug),
        })),
      }),
  );

  return (
    <div className="space-y-16">
      <JsonLd data={jsonLd} />
      {/* ── ② Billboard — trailer playing behind the nav.
             Height is capped so the rail below always peeks above the fold:
             cinema atmosphere AND a visible "there's more down there". ── */}
      {billboard ? (
        <section className="relative -mt-[8.25rem] left-1/2 w-screen -translate-x-1/2 sm:-mt-[5.5rem]">
          <div className="cx-beam relative flex min-h-[clamp(30rem,68vh,40rem)] flex-col justify-end overflow-hidden">
            <BillboardMedia
              image={billboard.movie.image}
              trailerKey={billboard.movie.trailerKey}
              trailerFile={billboard.movie.trailerFile}
            />
            {/* Two-axis scrim: dark enough to read type over, light enough that
                the film still reads as a film. */}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/35 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/65 via-background/10 to-transparent" />
            <div className="cx-perf absolute inset-x-0 bottom-0 z-[1]" aria-hidden="true" />
            {/* pt matches the pull-up above, so when a long title and excerpt
                grow the copy block past the stage's min-height, the text opens
                the stage downward instead of riding up under the nav — that
                was the "long headline gets clipped top and bottom" bug. The
                clamps are the second half of the fix: three lines of headline
                and two of excerpt is a billboard, more is a review page. */}
            <div className="relative mx-auto w-full max-w-5xl px-4 pb-14 pt-[9.5rem] sm:pt-[7rem]">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
                Featured review
              </p>
              <Link href={`/reviews/${billboard.slug}`} className="group mt-3 block max-w-2xl">
                <h1 className="line-clamp-3 text-balance text-[clamp(1.9rem,7vw,3.75rem)] font-bold leading-[1.08] tracking-tight group-hover:text-accent transition-colors">
                  {billboard.title}
                </h1>
              </Link>
              {billboard.excerpt && (
                <p className="mt-4 line-clamp-2 max-w-xl text-lg leading-relaxed text-foreground/80">
                  {billboard.excerpt}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-muted">
                <StarRating rating={billboard.rating} />
                <span>
                  {billboard.movie.title}
                  {billboard.movie.releaseDate
                    ? ` (${new Date(billboard.movie.releaseDate).getFullYear()})`
                    : ""}
                </span>
                <span>by {billboard.author.displayName ?? billboard.author.username}</span>
              </div>
              <div className="mt-7 flex gap-3">
                <Link
                  href={`/reviews/${billboard.slug}`}
                  className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-black hover:opacity-90"
                >
                  ▶ Read the review
                </Link>
                <Link
                  href="/write"
                  className="rounded-lg border border-line bg-background/40 px-6 py-2.5 text-sm font-semibold backdrop-blur hover:border-accent-dim"
                >
                  ✚ Write yours
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : movieCount > 0 ? (
        /* No reviews yet, but films are in — lead with the library so the page
           is never an empty stage. */
        <section className="pt-10">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            For the love of <span className="text-accent">film criticism</span>
          </h1>
          <p className="mt-4 max-w-2xl text-muted">
            {movieCount.toLocaleString("en-US")} films are on the shelf and nobody has written
            about them yet. That is an opportunity.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/write"
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
            >
              Write the first review
            </Link>
            <Link
              href="/movies"
              className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:border-accent-dim"
            >
              Browse the library
            </Link>
          </div>
        </section>
      ) : (
        <section className="pt-16 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            For the love of <span className="text-accent">film criticism</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Write reviews, rate films, and celebrate the critics who taught us how to watch.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/register"
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
            >
              Join CinePixo
            </Link>
          </div>
        </section>
      )}

      {/* ── ③ In the library — posters directly under the billboard.
             Pulled up so the cards break the fold: the page announces
             "keep scrolling" by itself, and it leads with films, not text. ── */}
      {shelf.length > 0 && (
        <Rail
          title="In the library"
          className="relative z-[1] -mt-4"
          action={
            <Link href="/movies" className="text-sm text-muted hover:text-foreground">
              All movies →
            </Link>
          }
        >
          {shelf.map((m) => {
              const n = m.reviews.length;
              const avgR = n > 0 ? m.reviews.reduce((s, r) => s + r.rating, 0) / n : null;
              return (
                <Link key={m.id} href={`/movies/${m.slug}`} className="group w-40">
                  <Poster
                    path={m.posterPath}
                    image={m.image}
                    year={m.releaseDate ? new Date(m.releaseDate).getFullYear() : null}
                    genres={m.genres}
                    title={m.title}
                    className="aspect-2/3 w-full rounded-lg border border-line shadow-lg transition-transform group-hover:scale-[1.03]"
                  />
                  <p className="mt-2 truncate text-sm group-hover:text-accent transition-colors">
                    {m.title}
                  </p>
                  <p className="font-mono text-xs text-muted">
                    {m.releaseDate ? new Date(m.releaseDate).getFullYear() : ""}
                    {avgR != null && (
                      <span className="ml-2 text-accent">★ {toStarScale(avgR).toFixed(1)}</span>
                    )}
                    {n === 0 && <span className="ml-1 text-accent/70">· review it first</span>}
                  </p>
                </Link>
              );
            })}
        </Rail>
      )}

      {/* ── ④ Latest reviews — mixed-density rail ── */}
      {railReviews.length > 0 && (
        <Rail
          title="Latest reviews"
          action={
            <Link href="/reviews" className="text-sm text-muted hover:text-foreground">
              All reviews →
            </Link>
          }
        >
          {railReviews.map((r, i) => (
              <Link
                key={r.slug}
                href={`/reviews/${r.slug}`}
                className={`group relative overflow-hidden rounded-xl border border-line ${
                  i === 0 ? "w-[32rem] max-w-[88vw]" : "w-64"
                }`}
              >
                <div className={`relative ${i === 0 ? "aspect-video" : "aspect-[4/5]"}`}>
                  {r.movie.image ? (
                    <Image
                      src={r.movie.image}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 88vw, 512px"
                      className="object-cover opacity-60 transition-all group-hover:scale-[1.04] group-hover:opacity-75"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-surface-raised" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      {r.movie.title}
                    </p>
                    <h3 className={`mt-0.5 font-semibold leading-snug ${i === 0 ? "text-xl" : "text-sm line-clamp-2"}`}>
                      {r.title}
                    </h3>
                    {i === 0 && r.excerpt && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted">{r.excerpt}</p>
                    )}
                    <p className="mt-1.5 font-mono text-xs text-accent">
                      ★ {toStarScale(r.rating).toFixed(1)}
                      <span className="ml-2 text-muted">
                        {r.author.displayName ?? r.author.username}
                      </span>
                    </p>
                  </div>
                </div>
              </Link>
            ))}
        </Rail>
      )}

      {/* ── ④ Editorial spread — this week's read ── */}
      {lead && (
        <section className="grid items-center gap-8 border-y border-line py-10 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
              The week&apos;s read
            </p>
            <blockquote className="mt-4 border-l-2 border-accent pl-5 text-2xl font-medium leading-snug text-foreground/90 sm:text-[1.7rem]">
              “{lead.excerpt}”
            </blockquote>
            <p className="mt-4 text-sm text-muted">
              from{" "}
              <Link
                href={`/reviews/${lead.slug}`}
                className="font-semibold text-foreground underline decoration-accent underline-offset-4 hover:text-accent"
              >
                {lead.title}
              </Link>{" "}
              · {lead.movie.title} · by {lead.author.displayName ?? lead.author.username} ·{" "}
              <StarRating rating={lead.rating} showNumber={false} />
            </p>
          </div>
          <Link href={`/movies/${lead.movie.slug}`} className="hidden sm:block">
            <Poster
              path={lead.movie.posterPath}
              image={lead.movie.image}
              title={lead.movie.title}
              className="w-36 rotate-2 rounded-xl border border-line shadow-2xl transition-transform hover:rotate-0"
            />
          </Link>
        </section>
      )}

      {/* ── ⑤ Off Camera — the writing that isn't scored ──
            Between the editorial spread and the rankings, which is where it
            belongs in the reading order: a visitor who has just been shown one
            critic's argument about one film is exactly the visitor for whom
            "and here is what that actor did next" is the next click. It is also
            the shelf a search for a *name* rather than a film lands on, so the
            home page has to admit it exists. */}
      {posts.length > 0 && (
        <section className="border-y border-line py-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
              Off Camera
            </h2>
            <Link href="/blog" className="text-sm text-accent hover:opacity-80">
              The blog →
            </Link>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Film writing that isn&rsquo;t a review — the people who make pictures away from the
            picture, the arguments the industry is having, and what to watch next.
          </p>
          <div className="mt-4 divide-y divide-line border-t border-line">
            {posts.map((p) => (
              <PostRow key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* ── ⑤a Top rated — rank numerals layered behind posters ── */}
      {topRated.length > 0 && (
        <Rail
          title="Top rated by the fandom"
          action={
            <span className="hidden font-mono text-[10px] text-muted sm:inline">
              avg ★ weighted by review count
            </span>
          }
        >
          {topRated.map((m, i) => (
              <Link key={m.id} href={`/movies/${m.slug}`} className="group relative w-44 pl-10">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-2 bottom-4 z-0 select-none text-[7rem] font-black leading-none tracking-tighter text-transparent"
                  style={{ WebkitTextStroke: "3px color-mix(in oklab, var(--muted) 55%, transparent)" }}
                >
                  {i + 1}
                </span>
                <div className="relative z-[1]">
                  <Poster
                    path={m.posterPath}
                    image={m.image}
                    title={m.title}
                    className="aspect-2/3 w-full rounded-lg border border-line shadow-lg transition-transform group-hover:scale-[1.03]"
                  />
                  <p className="mt-1.5 truncate text-xs group-hover:text-accent transition-colors">
                    {m.title}
                  </p>
                  <p className="font-mono text-[11px] text-accent">
                    ★ {toStarScale(m.avg).toFixed(1)}
                    <span className="ml-1 text-muted">· {m.n}</span>
                  </p>
                </div>
              </Link>
            ))}
        </Rail>
      )}

      {/* ── ⑥ Critics spotlight — typographic rail ── */}
      {critics.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
              Critics we celebrate
            </h2>
            <Link href="/critics" className="text-sm text-muted hover:text-foreground">
              All critics →
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y border-line py-5">
            {critics.map((c) => (
              <Link
                key={c.slug}
                href={`/critics/${c.slug}`}
                className="text-xl font-semibold tracking-tight text-foreground/85 transition-colors hover:text-accent sm:text-2xl"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── ⑥ Join band ── */}
      <section className="border-t border-line pt-10">
        <div className="grid gap-8 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              Your take belongs here<span className="text-accent">.</span>
            </h2>
            <p className="mt-2 max-w-xl text-muted">
              Join the fandom, pick a film, and tell us what Ebert would have thought.
            </p>
            <div className="mt-5 flex gap-3">
              <Link
                href="/register"
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
              >
                Join CinePixo
              </Link>
              <Link
                href="/about"
                className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:border-accent-dim"
              >
                What is this place?
              </Link>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-10 gap-y-4 font-mono text-sm">
            {[
              { k: "Reviews", v: reviewCount },
              { k: "Movies", v: movieCount },
              { k: "Critics", v: criticCount },
              { k: "Members", v: memberCount },
            ].map((s) => (
              <div key={s.k}>
                <dd className="text-2xl font-bold text-accent tabular-nums">{s.v}</dd>
                <dt className="text-[11px] uppercase tracking-wide text-muted">{s.k}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
