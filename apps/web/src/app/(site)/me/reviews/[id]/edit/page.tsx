import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReviewForm } from "@/components/admin/ReviewForm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit review" };

export default async function EditMyReviewPage(props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await props.params;
  const [review, movies] = await Promise.all([
    prisma.review.findUnique({ where: { id } }),
    prisma.movie.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, releaseDate: true },
    }),
  ]);
  // ownership enforced here AND in the API layer
  if (!review || review.authorId !== user.id) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Edit review</h1>
      <div className="mt-6">
        <ReviewForm
          reviewId={review.id}
          apiBase="/api/v1/my/reviews"
          doneHref="/me/reviews"
          initial={{
            slug: review.slug,
            title: review.title,
            excerpt: review.excerpt ?? "",
            content: review.content,
            rating: review.rating,
            status: review.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
            movieId: review.movieId,
          }}
          movies={movies.map((m) => ({
            id: m.id,
            title: m.title,
            releaseDate: m.releaseDate?.toISOString() ?? null,
          }))}
        />
      </div>
    </div>
  );
}
