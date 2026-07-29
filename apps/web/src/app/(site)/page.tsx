import { prisma } from "@cinepixo/db";
import { toStarScale } from "@cinepixo/shared";
import Image from "next/image";
import Link from "next/link";
import { Poster } from "@/components/Poster";
import { StarRating } from "@/components/StarRating";

export const dynamic = "force-dynamic";

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
      title: true,
      posterPath: true,
      backdropPath: true,
      releaseDate: true,
      director: true,
    },
  },
} as const;

export default async function HomePage() {
  const [latest, movies, critics, counts] = await Promise.all([
    prisma.review.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 14,
      select: reviewSelect,
    }),
    prisma.movie.findMany({
      select: {
        id: true,
        title: true,
        posterPath: true,
        releaseDate: true,
        reviews: { where: { status: "PUBLISHED" }, select: { rating: true } },
      },
    }),
    prisma.critic.findMany({ orderBy: { name: "asc" }, take: 12 }),
    Promise.all([
      prisma.review.count({ where: { status: "PUBLISHED" } }),
      prisma.movie.count(),
      prisma.critic.count(),
      prisma.user.count(),
    ]),
  ]);

  // Billboard: newest review with a backdrop; Lead: the next one with an excerpt.
  const billboard = latest.find((r) => r.movie.backdropPath) ?? latest[0] ?? null;
  const lead = latest.find((r) => r !== billboard && r.excerpt) ?? null;
  const railReviews = latest.filter((r) => r !== billboard && r !== lead).slice(0, 10);

  // Top rated: fandom average weighted by review volume (shrunk toward the mean).
  const topRated = movies
    .map((m) => {
      const n = m.reviews.length;
      const avg = n > 0 ? m.reviews.reduce((s, r) => s + r.rating, 0) / n : null;
      return { ...m, n, avg, weighted: avg != null ? avg * (n / (n + 2)) : -1 };
    })
    .filter((m) => m.n > 0)
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 10);

  const [reviewCount, movieCount, criticCount, memberCount] = counts;

  return (
    <div className="space-y-16">
      {/* ── ② Billboard ── */}
      {billboard ? (
        <section className="relative -mt-8 left-1/2 w-screen -translate-x-1/2">
          <div className="relative flex min-h-[72vh] flex-col justify-end overflow-hidden">
            {billboard.movie.backdropPath ? (
              <Image
                src={`https://image.tmdb.org/t/p/w780${billboard.movie.backdropPath}`}
                alt=""
                fill
                priority
                className="object-cover opacity-40"
              />
            ) : (
              <div className="absolute inset-0 bg-surface" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10" />
            <div className="relative mx-auto w-full max-w-5xl px-4 pb-14">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
                Featured review
              </p>
              <Link href={`/reviews/${billboard.slug}`} className="group mt-3 block max-w-2xl">
                <h1 className="text-4xl font-bold leading-[1.1] tracking-tight group-hover:text-accent transition-colors sm:text-6xl">
                  {billboard.title}
                </h1>
              </Link>
              {billboard.excerpt && (
                <p className="mt-4 max-w-xl text-lg leading-relaxed text-foreground/80">
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

      {/* ── ③ Editorial spread — this week's read ── */}
      {lead && (
        <section className="grid items-center gap-8 sm:grid-cols-[1fr_auto]">
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
          <Link href={`/movies/${lead.movie.id}`} className="hidden sm:block">
            <Poster
              path={lead.movie.posterPath}
              title={lead.movie.title}
              className="w-36 rotate-2 rounded-xl border border-line shadow-2xl transition-transform hover:rotate-0"
            />
          </Link>
        </section>
      )}

      {/* ── ④ Latest reviews — mixed-density rail ── */}
      {railReviews.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
              Latest reviews
            </h2>
            <Link href="/reviews" className="text-sm text-muted hover:text-foreground">
              All reviews →
            </Link>
          </div>
          <div className="cx-rail mt-4">
            {railReviews.map((r, i) => (
              <Link
                key={r.slug}
                href={`/reviews/${r.slug}`}
                className={`group relative overflow-hidden rounded-xl border border-line ${
                  i === 0 ? "w-[26rem] max-w-[85vw]" : "w-56"
                }`}
              >
                <div className={`relative ${i === 0 ? "aspect-video" : "aspect-[4/5]"}`}>
                  {r.movie.backdropPath || r.movie.posterPath ? (
                    <Image
                      src={`https://image.tmdb.org/t/p/w780${
                        i === 0
                          ? (r.movie.backdropPath ?? r.movie.posterPath)
                          : (r.movie.posterPath ?? r.movie.backdropPath)
                      }`}
                      alt=""
                      fill
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
          </div>
        </section>
      )}

      {/* ── ⑤a Top rated — rank numerals layered behind posters ── */}
      {topRated.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
              Top rated by the fandom
            </h2>
            <span className="font-mono text-[10px] text-muted">
              avg ★ weighted by review count
            </span>
          </div>
          <div className="cx-rail mt-4 pl-6">
            {topRated.map((m, i) => (
              <Link key={m.id} href={`/movies/${m.id}`} className="group relative w-32 pl-7">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-1 bottom-0 z-0 select-none font-mono text-[5.5rem] font-extrabold leading-none text-transparent"
                  style={{ WebkitTextStroke: "2px var(--border)" }}
                >
                  {i + 1}
                </span>
                <div className="relative z-[1]">
                  <Poster
                    path={m.posterPath}
                    title={m.title}
                    className="aspect-2/3 w-full rounded-lg border border-line shadow-lg transition-transform group-hover:scale-[1.03]"
                  />
                  <p className="mt-1.5 truncate text-xs group-hover:text-accent transition-colors">
                    {m.title}
                  </p>
                  <p className="font-mono text-[11px] text-accent">
                    ★ {toStarScale(m.avg!).toFixed(1)}
                    <span className="ml-1 text-muted">· {m.n}</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── ⑤b Critics spotlight — typographic rail ── */}
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
