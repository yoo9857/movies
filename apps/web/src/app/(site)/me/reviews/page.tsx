import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MyReviewActions } from "@/components/MyReviewActions";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My reviews" };

export default async function MyReviewsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reviews = await prisma.review.findMany({
    where: { authorId: user.id },
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
        <h1 className="text-2xl font-bold">My reviews</h1>
        <Link
          href="/write"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
        >
          + Write a review
        </Link>
      </div>

      {reviews.length === 0 ? (
        <p className="mt-8 text-muted">
          You haven&apos;t written anything yet.{" "}
          <Link href="/write" className="text-accent hover:opacity-80">
            Write your first review →
          </Link>
        </p>
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
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">
                    {r.status === "PUBLISHED" ? (
                      <Link href={`/reviews/${r.slug}`} className="hover:text-accent">
                        {r.title}
                      </Link>
                    ) : (
                      r.title
                    )}
                  </td>
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
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <MyReviewActions reviewId={r.id} title={r.title} />
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
