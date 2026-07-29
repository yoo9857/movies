import { prisma } from "@cinepixo/db";
import { paginationSchema } from "@cinepixo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ReviewCard } from "@/components/ReviewCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reviews" };

export default async function ReviewsPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await props.searchParams;
  const { page, pageSize } = paginationSchema.parse({ page: sp.page });

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
        excerpt: true,
        rating: true,
        publishedAt: true,
        author: { select: { username: true, displayName: true } },
        movie: { select: { title: true, posterPath: true, director: true } },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="text-2xl font-bold">Reviews</h1>
      <p className="mt-1 text-sm text-muted">
        {total} published review{total === 1 ? "" : "s"}
      </p>

      {reviews.length === 0 ? (
        <p className="mt-8 text-muted">Nothing here yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {reviews.map((r) => (
            <ReviewCard key={r.slug} review={r} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-8 flex justify-center gap-2 text-sm" aria-label="Pagination">
          {page > 1 && (
            <Link
              href={`/reviews?page=${page - 1}`}
              className="rounded border border-line px-3 py-1.5 hover:border-accent-dim"
            >
              ← Previous
            </Link>
          )}
          <span className="px-3 py-1.5 text-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/reviews?page=${page + 1}`}
              className="rounded border border-line px-3 py-1.5 hover:border-accent-dim"
            >
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
