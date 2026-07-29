import { prisma } from "@cinepixo/db";
import Link from "next/link";
import { DeleteReviewButton } from "@/components/admin/DeleteReviewButton";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  const reviews = await prisma.review.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      rating: true,
      status: true,
      viewCount: true,
      updatedAt: true,
      movie: { select: { title: true } },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reviews</h1>
        <Link
          href="/admin/reviews/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
        >
          + New review
        </Link>
      </div>

      {reviews.length === 0 ? (
        <p className="mt-8 text-muted">No reviews yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Movie</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{r.title}</td>
                  <td className="px-4 py-3 text-muted">{r.movie.title}</td>
                  <td className="px-4 py-3 tabular-nums">{r.rating.toFixed(1)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.status === "PUBLISHED"
                          ? "rounded bg-accent/15 px-2 py-0.5 text-xs text-accent"
                          : "rounded bg-surface-raised px-2 py-0.5 text-xs text-muted"
                      }
                    >
                      {r.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">{r.viewCount}</td>
                  <td className="px-4 py-3 text-muted">
                    {r.updatedAt.toLocaleDateString("en-US")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {r.status === "PUBLISHED" && (
                        <Link
                          href={`/reviews/${r.slug}`}
                          className="text-xs text-muted hover:text-foreground"
                        >
                          View
                        </Link>
                      )}
                      <Link
                        href={`/admin/reviews/${r.id}/edit`}
                        className="text-xs text-accent hover:opacity-80"
                      >
                        Edit
                      </Link>
                      <DeleteReviewButton reviewId={r.id} title={r.title} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
