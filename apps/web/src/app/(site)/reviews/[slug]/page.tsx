import { prisma } from "@cinepixo/db";
import {
  extractHeadings,
  readingMinutes,
  slugSchema,
  toStarScale,
} from "@cinepixo/shared";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AdSlot } from "@/components/ads/AdSlot";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { Avatar } from "@/components/Avatar";
import { Poster } from "@/components/Poster";
import { ReelDivider, SectionHead } from "@/components/ReelDivider";
import { FilmSpecCard } from "@/components/review/FilmSpecCard";
import { HelpfulButton } from "@/components/review/HelpfulButton";
import { ReviewBody } from "@/components/review/ReviewBody";
import { ShareRow } from "@/components/review/ShareRow";
import { VerdictBlock } from "@/components/review/VerdictBlock";
import { StarRating } from "@/components/StarRating";
import { getCurrentUser } from "@/lib/auth";
import {
  absUrl,
  backdropUrl,
  breadcrumbNode,
  type Crumb,
  graph,
  hosted,
  movieEntityId,
  movieNode,
  pageMetadata,
  posterUrl,
  reviewEntityId,
  reviewNode,
  webPageNode,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

// `cache` so the metadata pass and the render share one query instead of two.
const getReview = cache(async (rawSlug: string) => {
  const parsed = slugSchema.safeParse(rawSlug);
  if (!parsed.success) return null;
  return prisma.review.findFirst({
    where: { slug: parsed.data, status: "PUBLISHED" },
    include: {
      author: {
        select: { id: true, username: true, displayName: true, bio: true, avatarUrl: true },
      },
      movie: { include: { images: { where: { kind: "backdrop" }, orderBy: { sort: "asc" } } } },
    },
  });
});

/** Trail shared by the visible breadcrumbs and the BreadcrumbList node. */
function trailFor(review: {
  title: string;
  movie: { slug: string; title: string };
}): Crumb[] {
  return [
    { name: "Reviews", path: "/reviews" },
    { name: review.movie.title, path: `/movies/${review.movie.slug}` },
    { name: review.title },
  ];
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const review = await getReview(slug);
  // Thrown here, not just in the page: for bots with blocking metadata this is
  // what turns a missing review into a real 404 instead of a soft one.
  if (!review) notFound();

  const movie = review.movie;
  const author = review.author.displayName ?? review.author.username;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;

  // The verdict is the sharpest sentence in the piece, so it is the one that
  // goes to search results and social cards.
  const description =
    review.verdict ??
    review.excerpt ??
    `${author} reviews ${movie.title}${year ? ` (${year})` : ""} for CinePixo.`;

  return pageMetadata({
    path: `/reviews/${review.slug}`,
    title: review.title,
    description,
    ogType: "article",
    // No `images` on purpose: `opengraph-image.tsx` in this segment draws the
    // house share card — title, verdict, score, author, wordmark — and an
    // explicit list here would win over it. A TMDB still is the same picture
    // every other site shares; the card is ours and says more.

    publishedTime: review.publishedAt,
    modifiedTime: review.updatedAt,
    authors: [author],
    section: movie.genres[0] ?? "Film criticism",
    tags: [movie.title, ...movie.genres, ...movie.keywords.slice(0, 6)],
    keywords: [movie.title, `${movie.title} review`, ...movie.genres],
    markdownPath: `/reviews/${review.slug}.md`,
  });
}

export default async function ReviewPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const [review, viewer] = await Promise.all([getReview(slug), getCurrentUser()]);
  if (!review) notFound();

  // Fire-and-forget view counter; render never waits or fails on it. Raw SQL
  // rather than `update`, because Prisma's @updatedAt fires on *any* update —
  // which made every page view bump `updatedAt`, and `updatedAt` is what the
  // graph publishes as `dateModified` and the sitemap as `lastmod`. A timestamp
  // that moves on every crawl is a timestamp crawlers learn to ignore.
  prisma
    .$executeRaw`UPDATE "Review" SET "viewCount" = "viewCount" + 1 WHERE id = ${review.id}`
    .catch(() => {});

  const movie = review.movie;
  const minutes = readingMinutes(review.content);
  const headings = extractHeadings(review.content);
  const date = review.publishedAt ? new Date(review.publishedAt) : null;
  const path = `/reviews/${review.slug}`;
  const url = absUrl(path);

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
        movie: { select: { title: true, posterPath: true, image: true } },
      },
    }),
  ]);

  const authorName = review.author.displayName ?? review.author.username;
  const trail = trailFor(review);

  // One list, two homes: inline above the body on narrow screens, a sticky
  // rail on wide ones. Links and ids are identical — only the frame differs.
  const contentsList = (
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
  );
  const hasContents = headings.length >= 3;

  // The page graph: the review, the film it reviews, where the page sits, and
  // what the page itself is. Cross-referenced by `@id` so a crawler resolves one
  // film and one review rather than four unrelated blobs.
  //
  // Deliberately absent: an `aggregateRating` for the film. This page shows one
  // critic's score, not the aggregate — claiming the aggregate here would be a
  // rating with nothing on screen to back it.
  const jsonLd = graph(
    webPageNode({
      path,
      name: review.title,
      description: review.verdict ?? review.excerpt,
      kind: "ItemPage",
      // Ours first — the TMDB helpers answer undefined by design.
      image:
        hosted(movie.image) ??
        backdropUrl(movie.backdropPath, "w1280") ??
        posterUrl(movie.posterPath, "w780"),
      datePublished: review.publishedAt,
      dateModified: review.updatedAt,
      hasBreadcrumb: true,
      // The page *is* the review and is *about* the film — two different claims,
      // and answer engines use both: one to attribute, one to retrieve.
      aboutId: movieEntityId(movie.slug),
      mainEntityId: reviewEntityId(review.slug),
      keywords: [movie.title, ...movie.genres],
      // The verdict, and nothing else — an assistant reading this page aloud
      // should give the judgment, not the navigation.
      speakableSelectors: ["[data-speakable]"],
      markdownUrl: absUrl(`${path}.md`),
    }),
    breadcrumbNode(path, trail),
    reviewNode(review, {
      author: review.author,
      movie,
      includeBody: true,
      movieById: true,
    }),
    movieNode(movie, { reviewIds: [reviewEntityId(review.slug)] }),
  );

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* ── Backdrop hero — our own artwork only, blurred to backdrop duty ── */}
      {movie.image && (
        <div className="relative -mt-[8.25rem] left-1/2 mb-8 w-screen -translate-x-1/2 sm:-mt-[5.5rem]">
          <div className="cx-beam relative h-56 overflow-hidden sm:h-72">
            <Image
              src={movie.image}
              alt=""
              fill
              priority
              sizes="100vw"
              className="scale-125 object-cover opacity-25 blur-2xl"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-black/20" />
            <div className="cx-perf absolute inset-x-0 bottom-0" aria-hidden="true" />
          </div>
        </div>
      )}

      {/* With a table of contents the page earns a second column: the article
          keeps its reading measure, the contents move to a sticky rail on the
          right, and the pair breaks out of the site's 5xl container so the
          rail widens the canvas instead of squeezing the prose. The rail is
          also where a future ad slot goes — under the contents, never inside
          the article column. Without contents, the single column stands. */}
      <div
        className={
          hasContents
            ? "xl:relative xl:left-1/2 xl:w-[min(76rem,100vw-3rem)] xl:-translate-x-1/2 xl:grid xl:grid-cols-[minmax(0,1fr)_17rem] xl:gap-12"
            : undefined
        }
      >
      <article className="mx-auto w-full max-w-3xl min-w-0">
        {/* ── Masthead ── */}
        <header>
          <Breadcrumbs trail={trail} />
          <h1 className="mt-2.5 text-balance text-[clamp(1.8rem,5vw,2.9rem)] font-bold leading-[1.12] tracking-tight">
            {review.title}
          </h1>
          {review.excerpt && (
            <p data-speakable className="mt-3 text-lg leading-relaxed text-muted">
              {review.excerpt}
            </p>
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
        <div className="mt-7" data-speakable>
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
              slug: movie.slug,
              title: movie.title,
              originalTitle: movie.originalTitle,
              releaseDate: movie.releaseDate,
              runtime: movie.runtime,
              certification: movie.certification,
              director: movie.director,
              genres: movie.genres,
              countries: movie.countries,
              posterPath: movie.posterPath,
              image: movie.image,
            }}
          />
        </div>

        {/* ── Contents, inline — only where the rail doesn't exist ── */}
        {hasContents && (
          <nav
            className="mt-7 rounded-xl border border-line bg-surface px-5 py-4 xl:hidden"
            aria-label="Contents"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              In this review
            </p>
            {contentsList}
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
              <Avatar src={review.author.avatarUrl} name={authorName} size={44} />
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
                          image={r.movie.image}
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

      {/* ── The rail: contents that follow the reader, room for more below ── */}
      {hasContents && (
        <aside className="hidden xl:block" aria-label="Article tools">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-8 overflow-y-auto">
            {/* No card here — the rail marks itself with a rule, the way the
                rest of the chrome does. The duplicate nav is fine: one of the
                two is always display:none. */}
            <nav className="border-l border-line pl-4" aria-label="Contents">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                In this review
              </p>
              {contentsList}
            </nav>
            {/* Under the contents, never inside the article column: the reader
                reaches the argument before they reach anything sold. Renders
                nothing until a publisher id and a slot id both exist. */}
            <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_RAIL ?? ""} height={600} />
          </div>
        </aside>
      )}
      </div>
    </>
  );
}
