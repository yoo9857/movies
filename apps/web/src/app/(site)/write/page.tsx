import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReviewEditor } from "@/components/review/ReviewEditor";
import { getCurrentUser } from "@/lib/auth";
import { editorSeedFilms } from "@/lib/editor-films";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

// Behind a login or a redirect, so it is kept out of the index — `follow`
// stays on so the public pages it links to are still discovered.
export const metadata: Metadata = pageMetadata({
  path: "/write",
  title: "Write a review",
  description: "Write and publish a review on CinePixo.",
  noIndex: true,
});

export default async function WritePage(props: {
  searchParams: Promise<{ movie?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await props.searchParams;

  // Drafts already on the server. Autosave has been creating these all along and
  // nothing ever offered them back — so leaving this page meant the piece was
  // only findable by knowing to look under "My reviews".
  const [movies, drafts] = await Promise.all([
    // `?movie=` is pinned into the seed, so a preset still resolves even though
    // this no longer reads the library. It used to read all 118,811 rows — on a
    // page any logged-in member can open.
    editorSeedFilms(sp.movie ?? null),
    prisma.review.findMany({
      where: { authorId: user.id, status: "DRAFT" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        movie: { select: { title: true } },
      },
    }),
  ]);

  // /write?movie=<id> lets "review this film" links preselect the picker
  const preset = sp.movie && movies.some((m) => m.id === sp.movie) ? sp.movie : "";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Write a review</h1>
      <p className="mt-1.5 text-sm text-muted">
        Publishing as {user.displayName ?? user.username}. Drafts save in this browser as you type,
        and to your account once a film is chosen.{" "}
        {movies.length === 0 && (
          <Link href="/movies" className="text-accent hover:opacity-80">
            The library is empty — an admin needs to import a film first.
          </Link>
        )}
      </p>

      {drafts.length > 0 && (
        <section className="mt-6 rounded-xl border border-line bg-surface px-5 py-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Pick up where you left off
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/me/reviews/${d.id}/edit`}
                  className="group flex items-baseline justify-between gap-4 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate transition-colors group-hover:text-accent">
                    {d.title.trim() || "Untitled draft"}
                    <span className="text-muted"> · {d.movie.title}</span>
                  </span>
                  <time
                    dateTime={d.updatedAt.toISOString()}
                    className="shrink-0 font-mono text-[11px] text-muted"
                  >
                    {d.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
          movies={movies}
        />
      </div>
    </div>
  );
}
