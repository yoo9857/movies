import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReviewForm } from "@/components/admin/ReviewForm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Write a review" };

export default async function WritePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const movies = await prisma.movie.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true, releaseDate: true },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Write a review</h1>
      <p className="mt-1 text-sm text-muted">
        Publishing as {user.displayName ?? user.username}. Markdown supported.
      </p>
      <div className="mt-6">
        <ReviewForm
          apiBase="/api/v1/my/reviews"
          doneHref="/me/reviews"
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
