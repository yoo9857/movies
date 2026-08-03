import { prisma } from "@cinepixo/db";
import { notFound } from "next/navigation";
import { ReviewEditor } from "@/components/review/ReviewEditor";
import { editorSeedFilms } from "@/lib/editor-films";

export const dynamic = "force-dynamic";

export default async function EditReviewPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) notFound();

  // Sequential on purpose: the seed has to pin this review's own film, so it has
  // to know which one that is. One extra round trip, against a query that used to
  // read the whole library.
  const movies = await editorSeedFilms(review.movieId);

  return (
    <div>
      <h1 className="text-2xl font-bold">Edit review</h1>
      <div className="mt-6">
        <ReviewEditor
          reviewId={review.id}
          apiBase="/api/v1/admin/reviews"
          doneHref="/admin/reviews"
          // The drafts channel only touches the caller's own rows; this review
          // usually belongs to another author. Ctrl+S saves in place instead.
          draftSync={false}
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
          movies={movies}
        />
      </div>
    </div>
  );
}
