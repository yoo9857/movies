import { prisma } from "@cinepixo/db";
import Image from "next/image";
import Link from "next/link";
import { ReviewCard } from "@/components/ReviewCard";
import { StarRating } from "@/components/StarRating";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [featured, reviews, stats] = await Promise.all([
    prisma.review.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: {
        slug: true,
        title: true,
        excerpt: true,
        rating: true,
        author: { select: { username: true, displayName: true } },
        movie: { select: { title: true, backdropPath: true, releaseDate: true } },
      },
    }),
    prisma.review.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      skip: 1,
      take: 6,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        rating: true,
        publishedAt: true,
        author: { select: { username: true, displayName: true } },
        movie: { select: { title: true, posterPath: true, director: true } },
      },
    }),
    Promise.all([
      prisma.review.count({ where: { status: "PUBLISHED" } }),
      prisma.movie.count(),
      prisma.critic.count(),
      prisma.user.count(),
    ]),
  ]);

  const [reviewCount, movieCount, criticCount, memberCount] = stats;

  return (
    <div className="space-y-14">
      {/* Featured hero */}
      {featured ? (
        <section className="relative -mt-8 left-1/2 w-screen -translate-x-1/2">
          <div className="relative min-h-[22rem] overflow-hidden sm:min-h-[26rem]">
            {featured.movie.backdropPath ? (
              <Image
                src={`https://image.tmdb.org/t/p/w780${featured.movie.backdropPath}`}
                alt=""
                fill
                priority
                className="object-cover opacity-30"
              />
            ) : (
              <div className="absolute inset-0 bg-surface" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
            <div className="relative mx-auto flex min-h-[22rem] max-w-5xl flex-col justify-end px-4 pb-10 sm:min-h-[26rem]">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">
                Featured review
              </p>
              <Link href={`/reviews/${featured.slug}`} className="group mt-2 block max-w-2xl">
                <h1 className="text-3xl font-bold leading-tight group-hover:text-accent transition-colors sm:text-4xl">
                  {featured.title}
                </h1>
              </Link>
              {featured.excerpt && (
                <p className="mt-3 max-w-xl text-muted">{featured.excerpt}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
                <StarRating rating={featured.rating} />
                <span>
                  {featured.movie.title}
                  {featured.movie.releaseDate
                    ? ` (${new Date(featured.movie.releaseDate).getFullYear()})`
                    : ""}
                </span>
                <span>by {featured.author.displayName ?? featured.author.username}</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="pt-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            For the love of <span className="text-accent">film criticism</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Write reviews, rate films, and celebrate the critics who taught us how to watch.
          </p>
        </section>
      )}

      {/* Stats strip */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Reviews", value: reviewCount, href: "/reviews" },
          { label: "Movies", value: movieCount, href: "/movies" },
          { label: "Critics", value: criticCount, href: "/critics" },
          { label: "Members", value: memberCount, href: "/register" },
        ].map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-xl border border-line bg-surface p-4 text-center transition-colors hover:border-accent-dim"
          >
            <p className="text-2xl font-bold tabular-nums text-accent">{s.value}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted">{s.label}</p>
          </Link>
        ))}
      </section>

      {/* Latest reviews */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Latest reviews</h2>
          <Link href="/reviews" className="text-sm text-muted hover:text-foreground">
            View all →
          </Link>
        </div>
        {reviews.length === 0 ? (
          <p className="text-muted">
            {featured
              ? "More reviews are on the way."
              : "No reviews yet — the projector is warming up."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {reviews.map((r) => (
              <ReviewCard key={r.slug} review={r} />
            ))}
          </div>
        )}
      </section>

      {/* Join CTA */}
      <section className="rounded-2xl border border-line bg-surface p-8 text-center">
        <h2 className="text-2xl font-bold">
          Your take belongs here<span className="text-accent">.</span>
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-muted">
          Join the fandom, pick a film, and tell us what Ebert would have thought.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link
            href="/register"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
          >
            Join CinePixo
          </Link>
          <Link
            href="/write"
            className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:border-accent-dim"
          >
            Write a review
          </Link>
        </div>
      </section>
    </div>
  );
}
