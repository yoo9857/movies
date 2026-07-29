import { prisma } from "@cinepixo/db";
import { parseJsonArray, slugSchema } from "@cinepixo/shared";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Poster } from "@/components/Poster";
import { StarRating } from "@/components/StarRating";

export const dynamic = "force-dynamic";

async function getReview(rawSlug: string) {
  const parsed = slugSchema.safeParse(rawSlug);
  if (!parsed.success) return null;
  return prisma.review.findFirst({
    where: { slug: parsed.data, status: "PUBLISHED" },
    include: {
      author: { select: { username: true, displayName: true } },
      movie: true,
    },
  });
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const review = await getReview(slug);
  if (!review) return { title: "Review not found" };
  const image = review.movie.backdropPath
    ? `https://image.tmdb.org/t/p/w780${review.movie.backdropPath}`
    : review.movie.posterPath
      ? `https://image.tmdb.org/t/p/w342${review.movie.posterPath}`
      : undefined;
  return {
    title: review.title,
    description: review.excerpt ?? undefined,
    openGraph: {
      title: review.title,
      description: review.excerpt ?? undefined,
      type: "article",
      images: image ? [image] : undefined,
    },
  };
}

export default async function ReviewPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const review = await getReview(slug);
  if (!review) notFound();

  // fire-and-forget view counter; page render never waits or fails on it
  prisma.review
    .update({ where: { id: review.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  const movie = review.movie;
  const genres = parseJsonArray(movie.genres);
  const date = review.publishedAt ? new Date(review.publishedAt) : null;

  return (
    <article className="mx-auto max-w-3xl">
      {movie.backdropPath && (
        <div className="relative -mt-8 left-1/2 mb-8 w-screen -translate-x-1/2">
          <div className="relative h-44 overflow-hidden sm:h-60">
            <Image
              src={`https://image.tmdb.org/t/p/w780${movie.backdropPath}`}
              alt=""
              fill
              priority
              className="object-cover opacity-35"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          </div>
        </div>
      )}
      <header>
        <p className="text-xs uppercase tracking-wide text-muted">
          <Link href={`/movies/${movie.id}`} className="hover:text-accent transition-colors">
            {movie.title}
            {movie.releaseDate ? ` (${new Date(movie.releaseDate).getFullYear()})` : ""}
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight">{review.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
          <StarRating rating={review.rating} />
          <span>by {review.author.displayName ?? review.author.username}</span>
          {date && <time dateTime={date.toISOString()}>{date.toLocaleDateString("en-US", { dateStyle: "long" })}</time>}
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-8 sm:flex-row">
        <div className="prose-review min-w-0 flex-1">
          {/* react-markdown never renders raw HTML — markdown in, safe DOM out */}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{review.content}</ReactMarkdown>
        </div>

        <aside className="w-full shrink-0 sm:w-52">
          <div className="rounded-xl border border-line bg-surface p-4">
            <Poster path={movie.posterPath} title={movie.title} className="w-full rounded-md" />
            <dl className="mt-3 space-y-1.5 text-sm">
              {movie.director && (
                <div>
                  <dt className="text-xs uppercase text-muted">Director</dt>
                  <dd>{movie.director}</dd>
                </div>
              )}
              {movie.runtime != null && movie.runtime > 0 && (
                <div>
                  <dt className="text-xs uppercase text-muted">Runtime</dt>
                  <dd>{movie.runtime} min</dd>
                </div>
              )}
              {genres.length > 0 && (
                <div>
                  <dt className="text-xs uppercase text-muted">Genres</dt>
                  <dd>{genres.join(", ")}</dd>
                </div>
              )}
            </dl>
          </div>
        </aside>
      </div>
    </article>
  );
}
