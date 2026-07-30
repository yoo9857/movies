import { prisma } from "@cinepixo/db";
import { TOPIC_KIND_LABELS, type TopicKind } from "@cinepixo/shared";
import Link from "next/link";
import { DeleteTopicButton } from "@/components/admin/DeleteTopicButton";

/**
 * The taxonomy desk.
 *
 * Two shelves, because a theme and a motif are different kinds of claim and the
 * public page never mixes them either. What the list makes visible is the
 * unfinished work — an axis with no definition or no films publishes as an empty
 * page, so both gaps are named in the row rather than left to be discovered.
 */

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  slug: string;
  name: string;
  kind: TopicKind;
  description: string | null;
  essay: string | null;
  films: number;
  /** Assignments carrying the sentence that justifies them. */
  noted: number;
}

function Shelf({ kind, rows }: { kind: TopicKind; rows: Row[] }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {TOPIC_KIND_LABELS[kind]}s · {rows.length}
        </h2>
        <p className="font-mono text-[10px] text-muted">
          {kind === "THEME" ? "what the films are about" : "what recurs on screen"}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">None yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3">Definition</th>
                <th className="px-4 py-3">Films</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/topics/${t.id}`}
                      className="block font-medium hover:text-accent"
                    >
                      {t.name}
                    </Link>
                    <span className="block font-mono text-[11px] text-muted">/{t.slug}</span>
                  </td>
                  <td className="max-w-sm px-4 py-3 text-muted">
                    {t.description ? (
                      <span className="line-clamp-2">{t.description}</span>
                    ) : (
                      <span className="text-red-400">missing</span>
                    )}
                    {t.essay && (
                      <span className="mt-1 block font-mono text-[10px] text-accent">
                        + the reading
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums">
                    {t.films === 0 ? <span className="text-red-400">0</span> : t.films}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-muted">
                    {t.noted}/{t.films}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/topics/${t.slug}`}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        View
                      </Link>
                      <Link
                        href={`/admin/topics/${t.id}`}
                        className="text-xs text-accent hover:opacity-80"
                      >
                        Edit
                      </Link>
                      <DeleteTopicButton topicId={t.id} name={t.name} filmCount={t.films} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function AdminTopicsPage() {
  const topics = await prisma.topic.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      kind: true,
      description: true,
      essay: true,
      movies: { select: { note: true } },
    },
  });

  const rows: Row[] = topics.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    kind: t.kind,
    description: t.description,
    essay: t.essay,
    films: t.movies.length,
    noted: t.movies.filter((m) => m.note !== null).length,
  }));

  const unfinished = rows.filter((t) => t.films === 0 || !t.description).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Topics &amp; motifs</h1>
        <div className="flex items-center gap-4">
          <p className="font-mono text-xs text-muted">
            {rows.length} axes · {unfinished} unfinished
          </p>
          <Link
            href="/admin/topics/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
          >
            + Add topic
          </Link>
        </div>
      </div>

      <Shelf kind="THEME" rows={rows.filter((t) => t.kind === "THEME")} />
      <Shelf kind="MOTIF" rows={rows.filter((t) => t.kind === "MOTIF")} />
    </div>
  );
}
