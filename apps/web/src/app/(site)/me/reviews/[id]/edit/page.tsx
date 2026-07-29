import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReviewEditor } from "@/components/review/ReviewEditor";
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
      select: { id: true, title: true, releaseDate: true, director: true },
    }),
  ]);
  // ownership enforced here AND in the API layer
  if (!review || review.authorId !== user.id) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Edit review</h1>
      <div className="mt-7">
        <ReviewEditor
          reviewId={review.id}
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
          }))}
        />
      </div>
    </div>
  );
}
