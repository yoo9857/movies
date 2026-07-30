import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { BoxOfficeBand } from "@/components/BoxOfficeBand";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CastRail } from "@/components/CastRail";
import { CrewList } from "@/components/CrewList";
import { JsonLd } from "@/components/JsonLd";
import { Poster } from "@/components/Poster";
import { PosterGallery } from "@/components/PosterGallery";
import { ReelDivider, SectionHead } from "@/components/ReelDivider";
import { ReviewIndex } from "@/components/ReviewIndex";
import { ScoreBand } from "@/components/ScoreBand";
import { TrailerEmbed } from "@/components/TrailerEmbed";
import { VideoGallery } from "@/components/VideoGallery";
import {
  backdropUrl,
  breadcrumbNode,
  type Crumb,
  graph,
  itemListNode,
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
//
// Slug first — that is the public identity. The id fallback keeps every URL
// minted before slugs existed alive; the page then 301s to the slug, so
// crawlers transfer what those old links earned instead of splitting it.
const getMovie = cache(async (param: string) => {
  if (!/^[a-z0-9-]{1,130}$/i.test(param)) return null;
  const bySlug = await prisma.movie.findUnique({
    where: { slug: param },
    include: movieInclude,
  });
  if (bySlug) return bySlug;
  return prisma.movie.findUnique({
    where: { id: param },
    include: movieInclude,
  });
});

const movieInclude = {
  // The linked Person carries the portrait we own and the page to link to.
  cast: {
    orderBy: { order: "asc" as const },
    include: { person: { select: { slug: true, image: true } } },
  },
  crew: { include: { person: { select: { slug: true } } } },
  videos: { orderBy: { sort: "asc" as const } },
  images: { orderBy: [{ kind: "asc" as const }, { sort: "asc" as const }] },
  reviews: {
    where: { status: "PUBLISHED" as const },
    orderBy: { publishedAt: "desc" as const },
    select: {
      slug: true,
      title: true,
      rating: true,
      publishedAt: true,
      author: { select: { username: true, displayName: true } },
    },
  },
};

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const movie = await getMovie(slug);
  if (!movie) return { title: "Movie not found", robots: { index: false, follow: false } };
  // The redirect must fire here, not only in the page body: metadata resolves
  // before the response streams, so this is the last moment a real 308 status
  // can still be sent. Thrown from the body, the shell has already flushed as
  // 200 and the "redirect" degrades to a meta tag only browsers honour —
  // invisible to the crawlers this move is for.
  if (movie.slug !== slug) permanentRedirect(`/movies/${movie.slug}`);

  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;
  const director = movie.crew.find((c) => c.job === "Director")?.name ?? movie.director;
  const reviewCount = movie.reviews.length;

  // Title carries the year, because "Nosferatu" alone is four different films.
  const title = year ? `${movie.title} (${year})` : movie.title;

  // Lead with what this page adds over a database entry: the criticism on it.
  const description =
    movie.overview ??
    [
      director ? `${movie.title}, directed by ${director}.` : `${movie.title}.`,
      reviewCount > 0
        ? `${reviewCount} review${reviewCount === 1 ? "" : "s"} on CinePixo, with full credits.`
        : "Full credits, and the first review is open.",
    ].join(" ");

  return pageMetadata({
    path: `/movies/${movie.slug}`,
    title,
    description,
    // No `images`: the segment's `opengraph-image.tsx` draws the house card,
    // which carries the fandom score a bare still cannot.

    keywords: [movie.title, `${movie.title} review`, ...movie.genres, director ?? ""].filter(
      Boolean,
    ),
    markdownPath: `/movies/${movie.slug}.md`,
  });
}

export default async function MoviePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const movie = await getMovie(slug);
  if (!movie) notFound();
  // Reached by the old id URL (or any stale alias): one hop to the real one.
  if (movie.slug !== slug) permanentRedirect(`/movies/${movie.slug}`);

  const { genres, keywords, countries } = movie;
  const ratings = movie.reviews.map((r) => r.rating);
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;

  // companies is a JSON column: shape it defensively, it is external data.
  const companies = (Array.isArray(movie.companies) ? movie.companies : [])
    .filter((c): c is { name: string } => typeof (c as { name?: unknown })?.name === "string")
    .slice(0, 8);

  // Other films in the same franchise, if the library has any.
  const seriesEntries = movie.collectionId
    ? await prisma.movie.findMany({
        where: { collectionId: movie.collectionId, NOT: { id: movie.id } },
        orderBy: { releaseDate: "asc" },
        select: { id: true, slug: true, title: true, posterPath: true, releaseDate: true },
      })
    : [];

  const socials = [
    movie.homepage && { label: "Official site", href: movie.homepage },
    movie.instagram && {
      label: "Instagram",
      href: `https://www.instagram.com/${movie.instagram}/`,
    },
    movie.facebook && { label: "Facebook", href: `https://www.facebook.com/${movie.facebook}/` },
    movie.twitter && { label: "X / Twitter", href: `https://twitter.com/${movie.twitter}` },
    movie.imdbId && { label: "IMDb", href: `https://www.imdb.com/title/${movie.imdbId}/` },
  ].filter((s): s is { label: string; href: string } => Boolean(s));

  // Similar: genre overlap within the library, most-reviewed first.
  const similar =
    genres.length > 0
      ? (
          await prisma.movie.findMany({
            where: { NOT: { id: movie.id } },
            select: {
              id: true,
              slug: true,
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
            overlap: m.genres.filter((g) => genres.includes(g)).length,
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

  const path = `/movies/${movie.slug}`;
  const trail: Crumb[] = [
    { name: "Movies", path: "/movies" },
    { name: year ? `${movie.title} (${year})` : movie.title },
  ];

  // The film, its criticism, and the index of that criticism — one graph.
  //
  // `aggregateRating` is emitted here and only here, because this is the page
  // that renders the aggregate. It is the fandom average on the same 0–5 scale
  // the score band shows; nothing is inferred and nothing external is claimed.
  const fandom =
    ratings.length > 0
      ? {
          averageStars: ratings.reduce((s, r) => s + r, 0) / ratings.length / 2,
          reviewCount: ratings.length,
        }
      : null;

  const jsonLd = graph(
    webPageNode({
      path,
      name: year ? `${movie.title} (${year})` : movie.title,
      description: movie.overview ?? movie.tagline,
      kind: "ItemPage",
      image: backdropUrl(movie.backdropPath, "w1280") ?? posterUrl(movie.posterPath, "w780"),
      dateModified: movie.updatedAt,
      hasBreadcrumb: true,
      aboutId: movieEntityId(movie.slug),
      mainEntityId: movieEntityId(movie.slug),
      keywords: [movie.title, ...genres],
      markdownUrl: `${path}.md`,
    }),
    breadcrumbNode(path, trail),
    movieNode(movie, {
      // personSlug points each credit at that person's page, so the graph
      // resolves one human across the site rather than one per film.
      cast: movie.cast.map((c) => ({ ...c, personSlug: c.person?.slug })),
      crew: movie.crew.map((c) => ({ ...c, personSlug: c.person?.slug })),
      companies,
      videos: movie.videos,
      fandom,
      reviewIds: movie.reviews.map((r) => reviewEntityId(r.slug)),
    }),
    // Each review as its own node: identity, author and score, but no body —
    // the body belongs to the review's own page, and duplicating it here would
    // put the same text at two URLs.
    ...movie.reviews.map((r) =>
      reviewNode(
        { ...r, content: "", updatedAt: r.publishedAt },
        { author: r.author, movie, movieById: true },
      ),
    ),
    movie.reviews.length > 0 &&
      itemListNode({
        path,
        name: `Reviews of ${movie.title}`,
        entries: movie.reviews.map((r) => ({
          path: `/reviews/${r.slug}`,
          name: r.title,
          entityId: reviewEntityId(r.slug),
        })),
      }),
  );

  return (
    <article className="space-y-12">
      <JsonLd data={jsonLd} />
      {/* ① Backdrop hero — full bleed, rises behind the nav, lit like a screen */}
      <header className="relative -mt-[8.25rem] left-1/2 w-screen -translate-x-1/2 sm:-mt-[5.5rem]">
        <div className="cx-beam relative min-h-[22rem] overflow-hidden sm:min-h-[28rem]">
          {movie.backdropPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w1280${movie.backdropPath}`}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover opacity-40"
            />
          ) : movie.posterPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w780${movie.posterPath}`}
              alt=""
              fill
              priority
              sizes="100vw"
              className="scale-125 object-cover opacity-25 blur-2xl"
            />
          ) : (
            <div className="absolute inset-0 bg-surface" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-black/20" />
          {/* the house rule, run along the foot of the screen */}
          <div className="cx-perf absolute inset-x-0 bottom-0 z-[1]" aria-hidden="true" />
          {/* sm:pl-48 keeps the hero copy clear of the poster layered below-left */}
          <div className="relative mx-auto flex min-h-[22rem] max-w-5xl flex-col justify-end px-4 pb-8 sm:min-h-[28rem] sm:pl-48">
            <div className="mb-3">
              <Breadcrumbs trail={trail} />
            </div>
            <h1 className="text-balance text-[clamp(1.9rem,6vw,3.25rem)] font-bold leading-[1.1] tracking-tight">
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
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/write`}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
              >
                ✚ Write a review
              </Link>
              {movie.collectionName && (
                <span className="rounded-lg border border-line bg-background/50 px-5 py-2.5 text-sm font-semibold backdrop-blur">
                  {movie.collectionName}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ② Score band — poster layered over it */}
      <div className="relative">
        <div className="sm:pl-44">
          <ScoreBand ratings={ratings} />
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
              <SectionHead>Synopsis</SectionHead>
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
          <div className="mb-3"><SectionHead>Credits</SectionHead></div>
          <CrewList
            crew={movie.crew.map((c) => ({
              id: c.id,
              name: c.name,
              job: c.job,
              person: c.person,
            }))}
            extra={[
              ...(movie.crew.length === 0 && movie.director
                ? [{ label: "Director", value: movie.director }]
                : []),
              ...(countries.length > 0 ? [{ label: "Country", value: countries.join(", ") }] : []),
              ...(companies.length > 0
                ? [{ label: "Studios", value: companies.map((c) => c.name).join(", ") }]
                : []),
              ...(movie.collectionName
                ? [{ label: "Series", value: movie.collectionName }]
                : []),
            ]}
          />

          {socials.length > 0 && (
            <>
              <div className="mb-3 mt-8"><SectionHead>Official</SectionHead></div>
              <ul className="flex flex-wrap gap-2">
                {socials.map((s) => (
                  <li key={s.href}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent-dim hover:text-foreground"
                    >
                      {s.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <ReelDivider />

      {/* ⑤ Box office */}
      <BoxOfficeBand budget={movie.budget} revenue={movie.revenue} />

      {/* ⑥ Cast rail */}
      <CastRail
        cast={movie.cast.map((c) => ({
          id: c.id,
          name: c.name,
          character: c.character,
          profilePath: c.profilePath,
          person: c.person,
        }))}
      />

      {/* ⑦ Videos — picker when a film has several */}
      {movie.videos.length > 0 ? (
        <VideoGallery
          title={movie.title}
          videos={movie.videos.map((v) => ({
            id: v.id,
            youtubeKey: v.youtubeKey,
            name: v.name,
            type: v.type,
            official: v.official,
          }))}
        />
      ) : (
        movie.trailerKey && <TrailerEmbed youtubeKey={movie.trailerKey} title={movie.title} />
      )}

      {/* ⑧ Artwork gallery */}
      <PosterGallery
        title={movie.title}
        artwork={movie.images.map((i) => ({ id: i.id, path: i.path, kind: i.kind }))}
      />

      {/* ⑨ The series this film belongs to */}
      {seriesEntries.length > 0 && (
        <section>
          <SectionHead>{movie.collectionName ?? "Series"}</SectionHead>
          <div className="cx-rail mt-3">
            {seriesEntries.map((s) => (
              <Link key={s.id} href={`/movies/${s.slug}`} className="group w-28">
                <Poster
                  path={s.posterPath}
                  title={s.title}
                  className="aspect-2/3 w-full rounded-lg border border-line transition-transform group-hover:scale-[1.03]"
                />
                <p className="mt-1.5 truncate text-xs group-hover:text-accent transition-colors">
                  {s.title}
                </p>
                <p className="font-mono text-[11px] text-muted">
                  {s.releaseDate ? new Date(s.releaseDate).getFullYear() : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ⑨ Fandom reviews — credits-roll index */}
      <section>
        <SectionHead
          action={
            // Preselect this film — arriving from its own page and still having
            // to find it in the picker is a step nobody should take twice.
            <Link
              href={`/write?movie=${movie.id}`}
              className="text-sm text-accent hover:opacity-80"
            >
              Write yours →
            </Link>
          }
        >
          Fandom reviews · {movie.reviews.length}
        </SectionHead>
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
          <SectionHead>More like this</SectionHead>
          <div className="cx-rail mt-3">
            {similar.map((m) => (
              <Link key={m.id} href={`/movies/${m.slug}`} className="group w-28">
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
