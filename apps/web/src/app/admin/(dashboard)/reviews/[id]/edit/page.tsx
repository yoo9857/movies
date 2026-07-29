import { prisma } from "@cinepixo/db";
import { notFound } from "next/navigation";
import { ReviewEditor } from "@/components/review/ReviewEditor";

export const dynamic = "force-dynamic";

export default async function EditReviewPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const [review, movies] = await Promise.all([
    prisma.review.findUnique({ where: { id } }),
    prisma.movie.findMany({
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        releaseDate: true,
        director: true,
        trailerKey: true,
        images: { where: { kind: "backdrop" }, orderBy: { sort: "asc" }, select: { path: true } },
      },
    }),
  ]);
  if (!review) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold">Edit review</h1>
      <div className="mt-6">
        <ReviewEditor
          reviewId={review.id}
          apiBase="/api/v1/admin/reviews"
          doneHref="/admin/reviews"
          initial={{
            slug: review.slug,
            title: review.title,
            excerpt: review.excerpt ?? "",
            verdict: review.verdict ?? "",
            content: review.content,
            rating: review.rating,
            status: review.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
            spoilers:
              review.spoilers === "FULL" ? "FULL" : review.spoilers === "MILD" ? "MILD" : "NONE",
            movieId: review.movieId,
          }}
          movies={movies.map((m) => ({
            id: m.id,
            title: m.title,
            year: m.releaseDate ? new Date(m.releaseDate).getFullYear() : null,
            director: m.director,
            trailerKey: m.trailerKey,
            stills: m.images.map((i) => i.path),
          }))}
        />
      </div>
    </div>
  );
}
