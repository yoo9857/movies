import { prisma } from "@cinepixo/db";
import { parseJsonArray } from "@cinepixo/shared";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BoxOfficeBand } from "@/components/BoxOfficeBand";
import { CastRail } from "@/components/CastRail";
import { CrewList } from "@/components/CrewList";
import { Poster } from "@/components/Poster";
import { ReviewIndex } from "@/components/ReviewIndex";
import { ScoreBand } from "@/components/ScoreBand";
import { TrailerEmbed } from "@/components/TrailerEmbed";

export const dynamic = "force-dynamic";

async function getMovie(id: string) {
  if (!/^[a-z0-9]{1,64}$/i.test(id)) return null;
  return prisma.movie.findUnique({
    where: { id },
    include: {
      cast: { orderBy: { order: "asc" } },
      crew: true,
      reviews: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        select: {
          slug: true,
          title: true,
          rating: true,
          publishedAt: true,
          author: { select: { username: true, displayName: true } },
        },
      },
    },
  });
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const movie = await getMovie(id);
  if (!movie) return { title: "Movie not found" };
  return {
    title: movie.title,
    description: movie.overview ?? undefined,
    openGraph: movie.backdropPath
      ? { images: [`https://image.tmdb.org/t/p/w780${movie.backdropPath}`] }
      : undefined,
  };
}

export default async function MoviePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const movie = await getMovie(id);
  if (!movie) notFound();

  const genres = parseJsonArray(movie.genres);
  const keywords = parseJsonArray(movie.keywords);
  const countries = parseJsonArray(movie.countries);
  const ratings = movie.reviews.map((r) => r.rating);
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;

  // Similar: genre overlap within the library, most-reviewed first.
  const similar =
    genres.length > 0
      ? (
          await prisma.movie.findMany({
            where: { NOT: { id: movie.id } },
            select: {
              id: true,
              title: true,
              posterPath: true,
              releaseDate: true,
              genres: true,
              _count: { select: { reviews: { where: { status: "PUBLISHED" } } } },
            },
            take: 40,
          })
        )
          .map((m) => ({
            ...m,
            overlap: parseJsonArray(m.genres).filter((g) => genres.includes(g)).length,
          }))
          .filter((m) => m.overlap > 0)
          .sort((a, b) => b.overlap - a.overlap || b._count.reviews - a._count.reviews)
          .slice(0, 8)
      : [];

  const metaLine = [
    year,
    movie.certification,
    movie.runtime ? `${movie.runtime} min` : null,
    genres.join(" · ") || null,
  ]
    .filter(Boolean)
    .join("  |  ");

  return (
    <article className="space-y-12">
      {/* ① Backdrop hero — full bleed */}
      <header className="relative -mt-8 left-1/2 w-screen -translate-x-1/2">
        <div className="relative min-h-[19rem] overflow-hidden sm:min-h-[24rem]">
          {movie.backdropPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w780${movie.backdropPath}`}
              alt=""
              fill
              priority
              className="object-cover opacity-35"
            />
          ) : (
            <div className="absolute inset-0 bg-surface" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-transparent" />
          <div className="relative mx-auto flex min-h-[19rem] max-w-5xl flex-col justify-end px-4 pb-8 sm:min-h-[24rem]">
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              {movie.title}
            </h1>
            {movie.tagline && (
              <p className="mt-2 text-lg italic text-muted">“{movie.tagline}”</p>
            )}
            <p className="mt-3 font-mono text-xs uppercase tracking-wide text-muted">
              {movie.originalTitle && movie.originalTitle !== movie.title
                ? `${movie.originalTitle}  ·  `
                : ""}
              {metaLine}
            </p>
            <div className="mt-5 flex gap-3">
              <Link
                href={`/write`}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
              >
                ✚ Write a review
              </Link>
              {movie.imdbId && (
                <a
                  href={`https://www.imdb.com/title/${movie.imdbId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-line bg-background/50 px-5 py-2.5 text-sm font-semibold backdrop-blur hover:border-accent-dim"
                >
                  IMDb ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ② Score band — poster layered over it */}
      <div className="relative">
        <div className="sm:pl-44">
          <ScoreBand
            ratings={ratings}
            tmdbScore={movie.voteAverage}
            tmdbVotes={movie.voteCount}
          />
        </div>
        <div className="absolute -top-36 left-0 hidden w-36 sm:block">
          <Poster
            path={movie.posterPath}
            title={movie.title}
            className="w-full rounded-xl border border-line shadow-2xl"
          />
        </div>
      </div>

      {/* ③④ Synopsis column + credits list — 2:1 asymmetric */}
      <div className="grid gap-10 sm:grid-cols-[2fr_1fr]">
        <div className="min-w-0">
          {movie.overview && (
            <>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                Synopsis
              </h2>
              <p className="mt-3 max-w-[65ch] text-[1.06rem] leading-relaxed text-foreground/95">
                {movie.overview}
              </p>
            </>
          )}
          {keywords.length > 0 && (
            <p className="mt-6 border-t border-line pt-3 font-mono text-xs text-muted">
              {keywords.join("  /  ")}
            </p>
          )}
        </div>
        <div>
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Credits
          </h2>
          <CrewList
            crew={movie.crew.map((c) => ({ id: c.id, name: c.name, job: c.job }))}
            extra={[
              ...(movie.crew.length === 0 && movie.director
                ? [{ label: "Director", value: movie.director }]
                : []),
              ...(countries.length > 0 ? [{ label: "Country", value: countries.join(", ") }] : []),
            ]}
          />
        </div>
      </div>

      {/* ⑤ Box office */}
      <BoxOfficeBand budget={movie.budget} revenue={movie.revenue} />

      {/* ⑥ Cast rail */}
      <CastRail
        cast={movie.cast.map((c) => ({
          id: c.id,
          name: c.name,
          character: c.character,
          profilePath: c.profilePath,
        }))}
      />

      {/* ⑦ Trailer */}
      {movie.trailerKey && <TrailerEmbed youtubeKey={movie.trailerKey} title={movie.title} />}

      {/* ⑨ Fandom reviews — credits-roll index */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Fandom reviews · {movie.reviews.length}
          </h2>
          <Link href="/write" className="text-sm text-accent hover:opacity-80">
            Write yours →
          </Link>
        </div>
        {movie.reviews.length === 0 ? (
          <p className="mt-4 text-muted">No reviews yet — be the first.</p>
        ) : (
          <div className="mt-4">
            <ReviewIndex reviews={movie.reviews} showMovie={false} />
          </div>
        )}
      </section>

      {/* ⑩ Similar movies */}
      {similar.length > 0 && (
        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            More like this
          </h2>
          <div className="cx-rail mt-3">
            {similar.map((m) => (
              <Link key={m.id} href={`/movies/${m.id}`} className="group w-28">
                <Poster
                  path={m.posterPath}
                  title={m.title}
                  className="aspect-2/3 w-full rounded-lg border border-line transition-transform group-hover:scale-[1.03]"
                />
                <p className="mt-1.5 truncate text-xs group-hover:text-accent transition-colors">
                  {m.title}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
