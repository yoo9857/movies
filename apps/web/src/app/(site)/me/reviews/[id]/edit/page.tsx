import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReviewEditor } from "@/components/review/ReviewEditor";
import { getCurrentUser } from "@/lib/auth";
import { editorSeedFilms } from "@/lib/editor-films";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

// Behind a login or a redirect, so it is kept out of the index — `follow`
// stays on so the public pages it links to are still discovered.
export const metadata: Metadata = pageMetadata({
  path: "/me/reviews",
  title: "Edit review",
  description: "Edit one of your reviews.",
  noIndex: true,
});

export default async function EditMyReviewPage(props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await props.params;
  const review = await prisma.review.findUnique({ where: { id } });
  // ownership enforced here AND in the API layer
  if (!review || review.authorId !== user.id) notFound();

  // Seeded with this review's own film; the picker searches for anything else.
  // This page used to read all 118,811 films, which made a member's edit screen
  // as expensive as the query that took the site down on 2026-08-03.
  const movies = await editorSeedFilms(review.movieId);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Edit review</h1>
      <div className="mt-7">
        <ReviewEditor
          canPublish={Boolean(user.bio?.trim())}
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
          movies={movies}
        />
      </div>
    </div>
  );
}
