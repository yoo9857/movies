import { prisma } from "@cinepixo/db";
import { TOPIC_KIND_LABELS, toStarScale } from "@cinepixo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { Poster } from "@/components/Poster";
import { ReelDivider } from "@/components/ReelDivider";
import { MarkdownProse } from "@/components/review/ReviewBody";
import {
  breadcrumbNode,
  type Crumb,
  definedTermNode,
  definedTermSetNode,
  graph,
  itemListNode,
  movieEntityId,
  pageMetadata,
  topicEntityId,
  webPageNode,
} from "@/lib/seo";

/**
 * One axis of the taxonomy, argued film by film.
 *
 * The page is the claim "these films belong together" plus the evidence: the
 * definition up top, the essay if we've written one, then every film with the
 * sentence that justifies its place. The notes get the width — they are the
 * editorial work, and a film list without them is just a tag.
 */

export const dynamic = "force-dynamic";

const getTopic = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,130}$/i.test(slug)) return null;
  return prisma.topic.findUnique({
    where: { slug },
    include: {
      movies: {
        // The order the curator arranged, not chronology: this page is an
        // argument, and the sequence films are presented in is part of it.
        orderBy: { sort: "asc" },
        include: {
          movie: {
            select: {
              id: true,
              slug: true,
              title: true,
              posterPath: true,
              image: true,
              releaseDate: true,
              director: true,
              reviews: { where: { status: "PUBLISHED" as const }, select: { rating: true } },
            },
          },
        },
      },
    },
  });
});

/** Other topics sharing at least one film — the taxonomy cross-references itself. */
const getRelated = cache(async (topicId: string, movieIds: string[]) => {
  if (movieIds.length === 0) return [];
  const links = await prisma.movieTopic.findMany({
    where: { movieId: { in: movieIds }, NOT: { topicId } },
    select: { topic: { select: { slug: true, name: true, kind: true } } },
  });
  const seen = new Map<string, { slug: string; name: string; kind: "THEME" | "MOTIF"; shared: number }>();
  for (const l of links) {
    const e = seen.get(l.topic.slug) ?? { ...l.topic, shared: 0 };
    e.shared += 1;
    seen.set(l.topic.slug, e);
  }
  return [...seen.values()].sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name));
});

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const topic = await getTopic(slug);
  // Thrown here, not just in the page: for bots with blocking metadata this is
  // what turns a missing topic into a real 404 instead of a soft one.
  if (!topic) notFound();

  const kindWord = topic.kind === "THEME" ? "theme" : "motif";
  return pageMetadata({
    path: `/topics/${topic.slug}`,
    title: `${topic.name} — films about the ${kindWord}`,
    description:
      topic.description ??
      `${topic.movies.length} film${topic.movies.length === 1 ? "" : "s"} in the CinePixo library carrying the ${kindWord} "${topic.name}", each with a sentence on why.`,
    keywords: [topic.name, `${topic.name} films`, `film ${kindWord}`, "film criticism"],
    markdownPath: `/topics/${topic.slug}.md`,
    // No `images`: the segment's opengraph-image.tsx draws the house card.
  });
}

export default async function TopicPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const topic = await getTopic(slug);
  if (!topic) notFound();

  const films = topic.movies.map((mt) => {
    const ratings = mt.movie.reviews.map((r) => r.rating);
    return {
      movie: mt.movie,
      note: mt.note,
      year: mt.movie.releaseDate ? mt.movie.releaseDate.getUTCFullYear() : null,
      average: ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null,
      reviewCount: ratings.length,
    };
  });

  const related = await getRelated(topic.id, films.map((f) => f.movie.id));

  const path = `/topics/${topic.slug}`;
  const kindWord = topic.kind === "THEME" ? "theme" : "motif";
  const trail: Crumb[] = [{ name: "Topics & Motifs", path: "/topics" }, { name: topic.name }];

  const jsonLd = graph(
    webPageNode({
      path,
      name: topic.name,
      kind: "ItemPage",
      description: topic.description ?? undefined,
      dateModified: topic.updatedAt,
      hasBreadcrumb: true,
      aboutId: topicEntityId(topic.slug),
      mainEntityId: topicEntityId(topic.slug),
      keywords: [topic.name, ...films.map((f) => f.movie.title)],
      markdownUrl: `${path}.md`,
    }),
    breadcrumbNode(path, trail),
    definedTermSetNode(),
    definedTermNode(topic),
    films.length > 0 &&
      itemListNode({
        path,
        name: `Films carrying "${topic.name}"`,
        description: topic.description,
        entries: films.map((f) => ({
          path: `/movies/${f.movie.slug}`,
          name: f.movie.title,
          entityId: movieEntityId(f.movie.slug),
        })),
      }),
  );

  return (
    <div>
      <JsonLd data={jsonLd} />
      <Breadcrumbs trail={trail} />

      {/* ── The claim ── */}
      <header className="mt-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
          {TOPIC_KIND_LABELS[topic.kind]}
        </span>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{topic.name}</h1>
        {topic.description && (
          <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-muted">
            {topic.description}
          </p>
        )}
      </header>

      <ReelDivider className="my-9" />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-10">
          {topic.essay && (
            <section>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                The reading
              </h2>
              <div className="mt-3">
                <MarkdownProse text={topic.essay} />
              </div>
            </section>
          )}

          {/* ── The evidence: each film with its sentence ── */}
          <section>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              Films · {films.length}
            </h2>
            {films.length === 0 ? (
              <p className="mt-3 text-muted">No films assigned yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {films.map((f) => (
                  <Link
                    key={f.movie.id}
                    href={`/movies/${f.movie.slug}`}
                    className="group flex gap-4 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent-dim"
                  >
                    <Poster
                      path={f.movie.posterPath}
                      image={f.movie.image}
                      title={f.movie.title}
                      year={f.year}
                      size="thumb"
                      className="aspect-2/3 w-14 shrink-0 rounded border border-line object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-base font-semibold transition-colors group-hover:text-accent">
                          {f.movie.title}
                        </span>
                        <span className="font-mono text-xs text-muted tabular-nums">
                          {f.year ?? "—"}
                          {f.movie.director ? ` · ${f.movie.director}` : ""}
                        </span>
                        {f.average != null && (
                          <span className="font-mono text-xs text-accent tabular-nums">
                            ★ {toStarScale(f.average).toFixed(1)}
                            <span className="text-muted"> · {f.reviewCount}</span>
                          </span>
                        )}
                      </span>
                      {f.note && (
                        <span className="mt-1.5 block text-sm leading-relaxed text-muted">
                          {f.note}
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── The lookup material ── */}
        <aside className="space-y-8">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              At a glance
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Kind</dt>
                <dd>{TOPIC_KIND_LABELS[topic.kind]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Films</dt>
                <dd className="font-mono tabular-nums">{films.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Reviewed</dt>
                <dd className="font-mono tabular-nums">
                  {films.filter((f) => f.reviewCount > 0).length}
                </dd>
              </div>
            </dl>
          </div>

          {related.length > 0 && (
            <div>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                Crosses paths with
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {related.slice(0, 10).map((r) => (
                  <Link
                    key={r.slug}
                    href={`/topics/${r.slug}`}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted transition-colors hover:border-accent-dim hover:text-foreground"
                  >
                    {r.name}
                    <span className="ml-1.5 font-mono text-[10px] text-muted/70">{r.shared}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted">
            The {kindWord}, its definition and every per-film note are editorial work by this
            site&rsquo;s members — nothing on this page is imported.
          </p>
        </aside>
      </div>
    </div>
  );
}
