import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReviewEditor } from "@/components/review/ReviewEditor";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Write a review" };

export default async function WritePage(props: {
  searchParams: Promise<{ movie?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await props.searchParams;
  const movies = await prisma.movie.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true, releaseDate: true, director: true },
  });

  // /write?movie=<id> lets "review this film" links preselect the picker
  const preset = sp.movie && movies.some((m) => m.id === sp.movie) ? sp.movie : "";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Write a review</h1>
      <p className="mt-1.5 text-sm text-muted">
        Publishing as {user.displayName ?? user.username}. Drafts save in this browser as you
        type.{" "}
        {movies.length === 0 && (
          <Link href="/movies" className="text-accent hover:opacity-80">
            The library is empty — an admin needs to import a film first.
          </Link>
        )}
      </p>
      <div className="mt-7">
        <ReviewEditor
          initial={
            preset
              ? {
                  slug: "",
                  title: "",
                  excerpt: "",
                  verdict: "",
                  content: "",
                  rating: 7,
                  status: "DRAFT",
                  spoilers: "NONE",
                  movieId: preset,
                }
              : undefined
          }
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
