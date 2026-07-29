import { prisma } from "@cinepixo/db";
import { paginationSchema } from "@cinepixo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ReviewIndex } from "@/components/ReviewIndex";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reviews" };

export default async function ReviewsPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await props.searchParams;
  const { page } = paginationSchema.parse({ page: sp.page });
  const pageSize = 20;

  const where = { status: "PUBLISHED" } as const;
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
        movie: { select: { title: true, releaseDate: true } },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Reviews</h1>
        <p className="font-mono text-xs text-muted">
          {total} published · newest first
        </p>
      </div>

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
            <Link href={`/reviews?page=${page - 1}`} className="text-muted hover:text-foreground">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/reviews?page=${page + 1}`} className="text-muted hover:text-foreground">
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
