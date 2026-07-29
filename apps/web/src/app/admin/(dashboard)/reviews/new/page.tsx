import { prisma } from "@cinepixo/db";
import { ReviewEditor } from "@/components/review/ReviewEditor";

export const dynamic = "force-dynamic";

export default async function NewReviewPage() {
  const movies = await prisma.movie.findMany({
    orderBy: { title: "asc" },
    select: {
        id: true,
        title: true,
        releaseDate: true,
        director: true,
        trailerKey: true,
        images: { where: { kind: "backdrop" }, orderBy: { sort: "asc" }, select: { path: true } },
      },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">New review</h1>
      <div className="mt-6">
        <ReviewEditor
          apiBase="/api/v1/admin/reviews"
          doneHref="/admin/reviews"
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
