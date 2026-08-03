import { ReviewEditor } from "@/components/review/ReviewEditor";
import { editorSeedFilms } from "@/lib/editor-films";

export const dynamic = "force-dynamic";

export default async function NewReviewPage() {
  // A seed for the dropdown, not the library: the picker searches the server.
  const movies = await editorSeedFilms();

  return (
    <div>
      <h1 className="text-2xl font-bold">New review</h1>
      <div className="mt-6">
        <ReviewEditor apiBase="/api/v1/admin/reviews" doneHref="/admin/reviews" movies={movies} />
      </div>
    </div>
  );
}
