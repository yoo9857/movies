import { prisma } from "@cinepixo/db";
import { paginationSchema } from "@cinepixo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { ReviewIndex } from "@/components/ReviewIndex";
import {
  breadcrumbNode,
  type Crumb,
  graph,
  hosted,
  itemListNode,
  pageMetadata,
  posterUrl,
  reviewEntityId,
  webPageNode,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/** A byline filter: reviews are signed, so a signature deserves an address. */
const authorParam = (raw: string | undefined) =>
  raw && /^[a-z0-9_]{3,30}$/.test(raw) ? raw : null;

/** Page 1 is `/reviews`; page 2+ carry the query, and each self-canonicalises. */
function pathFor(page: number, author?: string | null): string {
  const params = new URLSearchParams();
  if (author) params.set("author", author);
  if (page > 1) params.set("page", String(page));
  const q = params.toString();
  return q ? `/reviews?${q}` : "/reviews";
}

export async function generateMetadata(props: {
  searchParams: Promise<{ page?: string; author?: string }>;
}): Promise<Metadata> {
  const sp = await props.searchParams;
  const { page } = paginationSchema.parse({ page: sp.page });
  const author = authorParam(sp.author);
  const byline = author
    ? await prisma.user.findUnique({
        where: { username: author },
        select: { displayName: true, username: true },
      })
    : null;
  const name = byline?.displayName ?? byline?.username;

  return pageMetadata({
    // Self-canonical, not a canonical back to page 1: page 3 holds reviews that
    // exist nowhere else, and pointing it at page 1 would drop them.
    path: pathFor(page, author),
    title: name
      ? page > 1
        ? `Reviews by ${name} — page ${page}`
        : `Reviews by ${name}`
      : page > 1
        ? `Reviews — page ${page}`
        : "Reviews",
    description: name
      ? `Every review ${name} has published on CinePixo, newest first.`
      : "Every review published on CinePixo, newest first — long-form criticism of individual films, signed and scored in half-stars.",
  });
}

export default async function ReviewsPage(props: {
  searchParams: Promise<{ page?: string; author?: string }>;
}) {
  const sp = await props.searchParams;
  const { page } = paginationSchema.parse({ page: sp.page });
  const pageSize = PAGE_SIZE;
  const author = authorParam(sp.author);
  const byline = author
    ? await prisma.user.findUnique({
        where: { username: author },
        select: { username: true, displayName: true, bio: true, avatarUrl: true },
      })
    : null;

  const where = {
    status: "PUBLISHED" as const,
    ...(byline ? { author: { username: byline.username } } : {}),
  };
  const [total, reviews] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        slug: true,
        title: true,
        rating: true,
        publishedAt: true,
        author: { select: { username: true, displayName: true } },
        movie: { select: { title: true, releaseDate: true, posterPath: true, image: true } },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const path = pathFor(page, byline?.username);
  const trail: Crumb[] = [
    { name: "Reviews", path: "/reviews" },
    ...(byline ? [{ name: byline.displayName ?? byline.username }] : []),
    ...(page > 1 ? [{ name: `Page ${page}` }] : []),
  ];

  const jsonLd = graph(
    webPageNode({
      path,
      name: page > 1 ? `Reviews — page ${page}` : "Reviews",
      description: "Long-form film criticism published on CinePixo, newest first.",
      kind: "CollectionPage",
      dateModified: reviews[0]?.publishedAt,
      hasBreadcrumb: true,
    }),
    breadcrumbNode(path, trail),
    reviews.length > 0 &&
      itemListNode({
        path,
        name: "Reviews",
        // `startAt` keeps positions continuous across pages, so position 21 on
        // page 2 is genuinely the 21st review and not the 1st again.
        startAt: (page - 1) * pageSize + 1,
        totalItems: total,
        entries: reviews.map((r) => ({
          path: `/reviews/${r.slug}`,
          name: r.title,
          image: hosted(r.movie.image) ?? posterUrl(r.movie.posterPath, "w342"),
          entityId: reviewEntityId(r.slug),
        })),
      }),
  );

  return (
    <div>
      <JsonLd data={jsonLd} />
      {page > 1 && (
        <div className="mb-4">
          <Breadcrumbs trail={trail} />
        </div>
      )}
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          {byline ? `Reviews by ${byline.displayName ?? byline.username}` : "Reviews"}
        </h1>
        <p className="font-mono text-xs text-muted">
          {total} published · newest first
        </p>
      </div>
      {byline?.bio && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{byline.bio}</p>}

      {reviews.length === 0 ? (
        <p className="mt-10 text-muted">Nothing here yet.</p>
      ) : (
        <div className="mt-8">
          <ReviewIndex reviews={reviews} startAt={(page - 1) * pageSize + 1} />
        </div>
      )}

      {totalPages > 1 && (
        <nav
          className="mt-8 flex items-baseline justify-between font-mono text-sm"
          aria-label="Pagination"
        >
          {page > 1 ? (
            <Link href={pathFor(page - 1, byline?.username)} className="text-muted hover:text-foreground">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pathFor(page + 1, byline?.username)} className="text-muted hover:text-foreground">
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
