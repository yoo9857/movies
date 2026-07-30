import { prisma } from "@cinepixo/db";
import { TOPIC_KIND_LABELS } from "@cinepixo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { ReelDivider, SectionHead } from "@/components/ReelDivider";
import {
  breadcrumbNode,
  type Crumb,
  definedTermNode,
  definedTermSetNode,
  graph,
  itemListNode,
  pageMetadata,
  posterUrl,
  TOPIC_SET_ID,
  topicEntityId,
  webPageNode,
} from "@/lib/seo";

/**
 * The taxonomy, laid out as what it is: two shelves.
 *
 * Themes (what a film is about) and motifs (what recurs on screen) are
 * different kinds of claim, so they never share a grid. Each card carries the
 * one-sentence definition and a strip of the films behind it — the definition
 * says what the axis means, the posters prove the site has done the reading.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    path: "/topics",
    title: "Topics & Motifs",
    description:
      "The editorial axes of the CinePixo library: themes a film is about and motifs that recur on screen — defined here, assigned film by film, with a sentence of justification each.",
    keywords: ["film themes", "film motifs", "film taxonomy", "film criticism"],
  });
}

interface TopicCardData {
  slug: string;
  name: string;
  kind: "THEME" | "MOTIF";
  description: string | null;
  films: { title: string; posterPath: string | null }[];
}

function TopicCard({ topic }: { topic: TopicCardData }) {
  return (
    <Link
      href={`/topics/${topic.slug}`}
      className="group flex flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent-dim"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
        {TOPIC_KIND_LABELS[topic.kind]}
      </span>
      <span className="mt-1 text-lg font-semibold leading-snug group-hover:text-accent">
        {topic.name}
      </span>
      {topic.description && (
        <span className="mt-1.5 line-clamp-2 text-sm text-muted">{topic.description}</span>
      )}
      <span className="mt-auto flex items-center gap-2 pt-4">
        <span className="flex -space-x-2">
          {topic.films.slice(0, 4).map((f, i) => {
            const src = posterUrl(f.posterPath, "w185");
            return src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${f.title}-${i}`}
                src={src}
                alt=""
                width={28}
                height={42}
                loading="lazy"
                className="h-[42px] w-[28px] rounded border border-line object-cover"
              />
            ) : null;
          })}
        </span>
        <span className="font-mono text-xs text-muted">
          {topic.films.length} {topic.films.length === 1 ? "film" : "films"}
        </span>
      </span>
    </Link>
  );
}

export default async function TopicsPage() {
  const topics = await prisma.topic.findMany({
    orderBy: { name: "asc" },
    select: {
      slug: true,
      name: true,
      kind: true,
      description: true,
      movies: {
        orderBy: { sort: "asc" },
        select: { movie: { select: { title: true, posterPath: true } } },
      },
    },
  });

  const cards: TopicCardData[] = topics.map((t) => ({
    slug: t.slug,
    name: t.name,
    kind: t.kind,
    description: t.description,
    films: t.movies.map((m) => m.movie),
  }));
  const themes = cards.filter((t) => t.kind === "THEME");
  const motifs = cards.filter((t) => t.kind === "MOTIF");

  const trail: Crumb[] = [{ name: "Topics & Motifs" }];
  const jsonLd = graph(
    webPageNode({
      path: "/topics",
      kind: "CollectionPage",
      name: "Topics & Motifs",
      description:
        "The editorial axes of the CinePixo library: themes and motifs, defined and assigned by the fandom.",
      hasBreadcrumb: true,
      mainEntityId: TOPIC_SET_ID,
    }),
    breadcrumbNode("/topics", trail),
    definedTermSetNode(),
    ...cards.map((t) => definedTermNode(t)),
    itemListNode({
      path: "/topics",
      name: "Topics & Motifs",
      entries: cards.map((t) => ({
        path: `/topics/${t.slug}`,
        name: t.name,
        entityId: topicEntityId(t.slug),
      })),
      totalItems: cards.length,
    }),
  );

  return (
    <div>
      <JsonLd data={jsonLd} />

      <h1 className="text-3xl font-bold tracking-tight">Topics &amp; Motifs</h1>
      <p className="mt-2 max-w-2xl text-muted">
        The axes we read films along. A <strong className="text-foreground">theme</strong> is what
        a film is about; a <strong className="text-foreground">motif</strong> is what recurs on
        screen. Every definition and every assignment is editorial work — nothing here is
        imported.
      </p>

      {cards.length === 0 ? (
        <p className="mt-10 text-muted">The taxonomy is being written.</p>
      ) : (
        <>
          {themes.length > 0 && (
            <section className="mt-9">
              <SectionHead
                action={
                  <span className="hidden font-mono text-[10px] text-muted sm:inline">
                    what the films are about
                  </span>
                }
              >
                Themes
              </SectionHead>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {themes.map((t) => (
                  <TopicCard key={t.slug} topic={t} />
                ))}
              </div>
            </section>
          )}

          {themes.length > 0 && motifs.length > 0 && <ReelDivider className="my-10" />}

          {motifs.length > 0 && (
            <section className={themes.length > 0 ? "" : "mt-9"}>
              <SectionHead
                action={
                  <span className="hidden font-mono text-[10px] text-muted sm:inline">
                    what recurs on screen
                  </span>
                }
              >
                Motifs
              </SectionHead>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {motifs.map((t) => (
                  <TopicCard key={t.slug} topic={t} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
