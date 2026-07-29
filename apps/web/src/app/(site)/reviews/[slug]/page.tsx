import { prisma } from "@cinepixo/db";
import {
  extractHeadings,
  parseJsonArray,
  readingMinutes,
  slugSchema,
  toStarScale,
} from "@cinepixo/shared";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Poster } from "@/components/Poster";
import { ReelDivider, SectionHead } from "@/components/ReelDivider";
import { FilmSpecCard } from "@/components/review/FilmSpecCard";
import { HelpfulButton } from "@/components/review/HelpfulButton";
import { ReviewBody } from "@/components/review/ReviewBody";
import { ShareRow } from "@/components/review/ShareRow";
import { VerdictBlock } from "@/components/review/VerdictBlock";
import { StarRating } from "@/components/StarRating";
import { getCurrentUser } from "@/lib/auth";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

async function getReview(rawSlug: string) {
  const parsed = slugSchema.safeParse(rawSlug);
  if (!parsed.success) return null;
  return prisma.review.findFirst({
    where: { slug: parsed.data, status: "PUBLISHED" },
    include: {
      author: { select: { id: true, username: true, displayName: true, bio: true } },
      movie: { include: { images: { where: { kind: "backdrop" }, orderBy: { sort: "asc" } } } },
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
  const description = review.verdict ?? review.excerpt ?? undefined;
  return {
    title: review.title,
    description,
    alternates: { canonical: `/reviews/${review.slug}` },
    openGraph: {
      title: review.title,
      description,
      type: "article",
      publishedTime: review.publishedAt?.toISOString(),
      authors: [review.author.displayName ?? review.author.username],
      images: image ? [image] : undefined,
    },
  };
}

export default async function ReviewPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const [review, viewer] = await Promise.all([getReview(slug), getCurrentUser()]);
  if (!review) notFound();

  // fire-and-forget view counter; render never waits or fails on it
  prisma.review
    .update({ where: { id: review.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  const movie = review.movie;
  const stars = toStarScale(review.rating);
  const minutes = readingMinutes(review.content);
  const headings = extractHeadings(review.content);
  const date = review.publishedAt ? new Date(review.publishedAt) : null;
  const url = `${SITE_URL}/reviews/${review.slug}`;

  const [voted, otherOnFilm, moreByAuthor] = await Promise.all([
    viewer
      ? prisma.reviewVote
          .findUnique({
            where: { reviewId_userId: { reviewId: review.id, userId: viewer.id } },
            select: { id: true },
          })
          .then(Boolean)
      : Promise.resolve(false),
    prisma.review.findMany({
      where: { movieId: movie.id, status: "PUBLISHED", NOT: { id: review.id } },
      orderBy: [{ helpfulCount: "desc" }, { publishedAt: "desc" }],
      take: 4,
      select: {
        slug: true,
        title: true,
        rating: true,
        author: { select: { username: true, displayName: true } },
      },
    }),
    prisma.review.findMany({
      where: { authorId: review.author.id, status: "PUBLISHED", NOT: { id: review.id } },
      orderBy: { publishedAt: "desc" },
      take: 4,
      select: {
        slug: true,
        title: true,
        rating: true,
        movie: { select: { title: true, posterPath: true } },
      },
    }),
  ]);

  const authorName = review.author.displayName ?? review.author.username;

  // Review structured data — the single biggest SEO lever for a review site.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Review",
    headline: review.title,
    reviewBody: review.content.slice(0, 5000),
    datePublished: review.publishedAt?.toISOString(),
    dateModified: review.updatedAt.toISOString(),
    url,
    author: { "@type": "Person", name: authorName },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    itemReviewed: {
      "@type": "Movie",
      name: movie.title,
      ...(movie.director ? { director: { "@type": "Person", name: movie.director } } : {}),
      ...(movie.releaseDate
        ? { dateCreated: new Date(movie.releaseDate).toISOString().slice(0, 10) }
        : {}),
      ...(movie.posterPath
        ? { image: `https://image.tmdb.org/t/p/w342${movie.posterPath}` }
        : {}),
    },
    reviewRating: {
      "@type": "Rating",
      ratingValue: stars,
      bestRating: 5,
      worstRating: 0,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify output is escaped for the </script> case below
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* ── Backdrop hero ── */}
      {movie.backdropPath && (
        <div className="relative -mt-[8.25rem] left-1/2 mb-8 w-screen -translate-x-1/2 sm:-mt-[5.5rem]">
          <div className="cx-beam relative h-56 overflow-hidden sm:h-72">
            <Image
              src={`https://image.tmdb.org/t/p/w1280${movie.backdropPath}`}
              alt=""
              fill
              priority
              className="object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-black/20" />
            <div className="cx-perf absolute inset-x-0 bottom-0" aria-hidden="true" />
          </div>
        </div>
      )}

      <article className="mx-auto max-w-3xl">
        {/* ── Masthead ── */}
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            <Link href={`/movies/${movie.id}`} className="transition-colors hover:text-accent">
              {movie.title}
              {movie.releaseDate ? ` (${new Date(movie.releaseDate).getFullYear()})` : ""}
            </Link>
          </p>
          <h1 className="mt-2.5 text-balance text-[clamp(1.8rem,5vw,2.9rem)] font-bold leading-[1.12] tracking-tight">
            {review.title}
          </h1>
          {review.excerpt && (
            <p className="mt-3 text-lg leading-relaxed text-muted">{review.excerpt}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-muted">
            <StarRating rating={review.rating} />
            <span>
              by{" "}
              <span className="font-semibold not-italic text-foreground/90">{authorName}</span>
            </span>
            {date && (
              <time dateTime={date.toISOString()}>
                {date.toLocaleDateString("en-US", { dateStyle: "long" })}
              </time>
            )}
            <span>{minutes} min read</span>
            {review.viewCount > 0 && <span>{review.viewCount.toLocaleString("en-US")} views</span>}
          </div>
        </header>

        {/* ── Verdict, conclusion first ── */}
        <div className="mt-7">
          <VerdictBlock
            rating={review.rating}
            verdict={review.verdict}
            spoilers={
              review.spoilers === "FULL" ? "FULL" : review.spoilers === "MILD" ? "MILD" : "NONE"
            }
          />
        </div>

        {/* ── The film under review ── */}
        <div className="mt-7">
          <FilmSpecCard
            film={{
              id: movie.id,
              title: movie.title,
              originalTitle: movie.originalTitle,
              releaseDate: movie.releaseDate,
              runtime: movie.runtime,
              certification: movie.certification,
              director: movie.director,
              genres: parseJsonArray(movie.genres),
              countries: parseJsonArray(movie.countries),
              posterPath: movie.posterPath,
            }}
          />
        </div>

        {/* ── Contents, for reviews long enough to need them ── */}
        {headings.length >= 3 && (
          <nav className="mt-7 rounded-xl border border-line bg-surface px-5 py-4" aria-label="Contents">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              In this review
            </p>
            <ol className="mt-2.5 space-y-1.5 text-sm">
              {headings.map((h, i) => (
                <li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
                  <a
                    href={`#${h.id}`}
                    className="flex gap-2.5 text-muted transition-colors hover:text-accent"
                  >
                    <span className="font-mono text-[11px] tabular-nums opacity-60">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{h.text}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* ── The review ── */}
        <div className="mt-9">
          <ReviewBody
            content={review.content}
            media={{
              title: movie.title,
              trailerKey: movie.trailerKey,
              stills: movie.images.map((i) => i.path),
            }}
          />
        </div>

        {/* ── Foot of the article ── */}
        <footer className="mt-12 space-y-8">
          <ReelDivider />

          <div className="flex flex-wrap items-center justify-between gap-4">
            <HelpfulButton
              slug={review.slug}
              count={review.helpfulCount}
              voted={voted}
              canVote={Boolean(viewer) && viewer!.id !== review.author.id}
            />
            <ShareRow url={url} title={review.title} />
          </div>

          {/* Author card */}
          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-lg font-bold text-black">
                {authorName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{authorName}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {review.author.bio ?? "A member of the CinePixo fandom."}
                </p>
              </div>
            </div>
            {moreByAuthor.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  More from {authorName}
                </p>
                <ul className="mt-3 space-y-2">
                  {moreByAuthor.map((r) => (
                    <li key={r.slug}>
                      <Link
                        href={`/reviews/${r.slug}`}
                        className="group flex items-center gap-3 text-sm"
                      >
                        <Poster
                          path={r.movie.posterPath}
                          title={r.movie.title}
                          className="h-10 w-7 shrink-0 rounded object-cover"
                        />
                        <span className="min-w-0 flex-1 truncate transition-colors group-hover:text-accent">
                          {r.title}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-accent">
                          ★ {toStarScale(r.rating).toFixed(1)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Other takes on the same film — the point of a fandom */}
          <section>
            <SectionHead
              action={
                <Link href="/write" className="text-sm text-accent hover:opacity-80">
                  Add yours →
                </Link>
              }
            >
              Other takes on {movie.title}
            </SectionHead>
            {otherOnFilm.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No one else has written about this film yet.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {otherOnFilm.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/reviews/${r.slug}`}
                      className="group flex items-center gap-3 py-3 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-medium transition-colors group-hover:text-accent">
                          {r.title}
                        </span>
                        <span className="text-muted">
                          {" "}
                          · {r.author.displayName ?? r.author.username}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-accent">
                        ★ {toStarScale(r.rating).toFixed(1)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </footer>
      </article>
    </>
  );
}
