import { prisma } from "@cinepixo/db";
import { TOPIC_KIND_LABELS } from "@cinepixo/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TopicFilmPicker } from "@/components/admin/TopicFilmPicker";
import { TopicForm } from "@/components/admin/TopicForm";
import { posterUrl } from "@/lib/seo";

/**
 * One axis, with the two things that make it publishable on one screen: the
 * definition and the films that carry it.
 *
 * This used to hand the picker the library whole, on the reasoning that it "is a
 * curated shelf of a few hundred titles at most, and a search endpoint for that
 * would be ceremony". True when written; the Wikidata import made the shelf
 * 118,811 rows, and the ceremony became the only thing keeping the page openable.
 * Only the films already assigned are resolved here now — the picker searches.
 */

export const dynamic = "force-dynamic";

export default async function AdminTopicPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const topic = await prisma.topic.findUnique({
    where: { id },
    include: { movies: { orderBy: { sort: "asc" }, select: { movieId: true, note: true } } },
  });
  if (!topic) notFound();

  // Only what is already on the axis. Sequential because the ids come from the
  // topic — one round trip, against a query that used to read the whole library.
  const assignedFilms = await prisma.movie.findMany({
    where: { id: { in: topic.movies.map((m) => m.movieId) } },
    select: { id: true, title: true, releaseDate: true, posterPath: true, image: true },
  });

  const kindWord = topic.kind === "THEME" ? "theme" : "motif";

  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            {TOPIC_KIND_LABELS[topic.kind]}
          </span>
          <h1 className="mt-1 text-2xl font-bold">{topic.name}</h1>
          <div className="mt-1 flex items-center gap-3 font-mono text-xs text-muted">
            <Link href={`/topics/${topic.slug}`} className="hover:text-accent">
              /topics/{topic.slug} ↗
            </Link>
            <Link href={`/topics/${topic.slug}.md`} className="hover:text-accent">
              .md ↗
            </Link>
          </div>
        </div>
        <Link href="/admin/topics" className="text-sm text-muted hover:text-foreground">
          ← All topics
        </Link>
      </div>

      <TopicForm
        topicId={topic.id}
        initial={{
          slug: topic.slug,
          name: topic.name,
          kind: topic.kind,
          description: topic.description ?? "",
          essay: topic.essay ?? "",
        }}
      />

      <TopicFilmPicker
        topicId={topic.id}
        kindWord={kindWord}
        assignedFilms={assignedFilms.map((m) => ({
          id: m.id,
          title: m.title,
          year: m.releaseDate ? m.releaseDate.getUTCFullYear() : null,
          // Our own artwork first: posterPath is set on nine rows in the whole
          // library, so this thumbnail was almost always blank.
          poster: m.image ?? posterUrl(m.posterPath, "w92") ?? null,
        }))}
        initial={topic.movies.map((m) => ({ movieId: m.movieId, note: m.note ?? "" }))}
      />
    </div>
  );
}
