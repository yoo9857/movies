import { prisma } from "@cinepixo/db";
import { ReviewForm } from "@/components/admin/ReviewForm";

export const dynamic = "force-dynamic";

export default async function NewReviewPage() {
  const movies = await prisma.movie.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true, releaseDate: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">New review</h1>
      <div className="mt-6">
        <ReviewForm
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
