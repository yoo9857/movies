import { prisma } from "@cinepixo/db";
import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/admin/ReviewForm";

export const dynamic = "force-dynamic";

export default async function EditReviewPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const [review, movies] = await Promise.all([
    prisma.review.findUnique({ where: { id } }),
    prisma.movie.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, releaseDate: true },
    }),
  ]);
  if (!review) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold">Edit review</h1>
      <div className="mt-6">
        <ReviewForm
          reviewId={review.id}
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
