import { prisma } from "@cinepixo/db";
import { parseJsonArray, toStarScale } from "@cinepixo/shared";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Poster } from "@/components/Poster";
import { StarRating } from "@/components/StarRating";

export const dynamic = "force-dynamic";

async function getMovie(id: string) {
  if (!/^[a-z0-9]{1,64}$/i.test(id)) return null;
  return prisma.movie.findUnique({
    where: { id },
    include: {
      reviews: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        select: {
          slug: true,
          title: true,
          excerpt: true,
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
  return { title: movie.title, description: movie.overview ?? undefined };
}

export default async function MoviePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const movie = await getMovie(id);
  if (!movie) notFound();

  const genres = parseJsonArray(movie.genres);
  const count = movie.reviews.length;
  const avg = count > 0 ? movie.reviews.reduce((s, r) => s + r.rating, 0) / count : null;

  return (
    <div className="-mt-8">
      {/* Backdrop hero */}
      <div className="relative left-1/2 w-screen -translate-x-1/2">
        <div className="relative h-56 overflow-hidden sm:h-72">
          {movie.backdropPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w780${movie.backdropPath}`}
              alt=""
              fill
              priority
              className="object-cover opacity-40"
            />
          ) : (
            <div className="h-full w-full bg-surface" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
      </div>

      <div className="relative z-[1] -mt-24 flex flex-col gap-6 sm:flex-row">
        <Poster
          path={movie.posterPath}
          title={movie.title}
          className="h-60 w-40 shrink-0 rounded-xl border border-line shadow-xl"
        />
        <div className="pt-2 sm:pt-24">
          <h1 className="text-3xl font-bold">
            {movie.title}
            {movie.releaseDate && (
              <span className="ml-2 font-normal text-muted">
                ({new Date(movie.releaseDate).getFullYear()})
              </span>
            )}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {[movie.director, movie.runtime ? `${movie.runtime} min` : null, genres.join(" · ")]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
          {avg != null && (
            <p className="mt-3 flex items-center gap-2">
              <StarRating rating={avg} />
              <span className="text-sm text-muted">
                fandom average · {count} review{count === 1 ? "" : "s"}
              </span>
            </p>
          )}
          {movie.overview && (
            <p className="mt-4 max-w-2xl leading-relaxed text-foreground/90">{movie.overview}</p>
          )}
        </div>
      </div>

      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Fandom reviews</h2>
          <Link href="/write" className="text-sm text-accent hover:opacity-80">
            Write yours →
          </Link>
        </div>
        {count === 0 ? (
          <p className="mt-4 text-muted">No reviews yet — be the first.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {movie.reviews.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/reviews/${r.slug}`}
                  className="group block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent-dim"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold group-hover:text-accent transition-colors">
                      {r.title}
                    </h3>
                    <StarRating rating={r.rating} />
                  </div>
                  {r.excerpt && <p className="mt-1 text-sm text-muted">{r.excerpt}</p>}
                  <p className="mt-2 text-xs text-muted">
                    by {r.author.displayName ?? r.author.username}
                    {r.publishedAt &&
                      ` · ${new Date(r.publishedAt).toLocaleDateString("en-US")}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
