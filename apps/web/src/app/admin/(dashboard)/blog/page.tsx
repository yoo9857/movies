import { prisma } from "@cinepixo/db";
import { POST_CATEGORY_LABELS, SOURCED_CATEGORIES } from "@cinepixo/shared";
import Link from "next/link";
import { DeletePostButton } from "@/components/admin/DeletePostButton";

/**
 * The blog desk.
 *
 * Drafts sit above published work because they are the unfinished business, and
 * the one column that is not decoration is Sources: a PEOPLE or ISSUE draft with
 * none cannot be published at all — the database refuses it — so the gap is named
 * in the row rather than discovered when Publish stays greyed out.
 */

export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  const posts = await prisma.post.findMany({
    // Drafts first, then newest activity — the same order the work happens in.
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      sources: true,
      viewCount: true,
      author: { select: { username: true, displayName: true } },
      _count: { select: { people: true, movies: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Off Camera</h1>
        <Link
          href="/admin/blog/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
        >
          Write a post
        </Link>
      </div>
      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        The writing that is not a review. Posts about people or a live argument must carry at
        least one source before they can be published — that is a database constraint, not a
        house style, because a claim about someone who can be harmed by our getting it wrong has
        to be traceable.
      </p>

      {posts.length === 0 ? (
        <p className="text-muted">Nothing written yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Post</th>
                <th className="px-4 py-3">Shelf</th>
                <th className="px-4 py-3">Sources</th>
                <th className="px-4 py-3">About</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => {
                const needsSources = SOURCED_CATEGORIES.includes(p.category);
                const blocked = needsSources && p.sources.length === 0;
                const subjects = p._count.people + p._count.movies;
                return (
                  <tr key={p.id} className="border-t border-line align-top">
                    <td className="max-w-sm px-4 py-3">
                      <Link
                        href={`/admin/blog/${p.id}/edit`}
                        className="block font-medium hover:text-accent"
                      >
                        {p.title}
                      </Link>
                      <span className="block font-mono text-[11px] text-muted">/blog/{p.slug}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-muted">
                        {p.author.displayName ?? p.author.username}
                        {p.viewCount > 0 ? ` · ${p.viewCount.toLocaleString("en-US")} views` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{POST_CATEGORY_LABELS[p.category]}</td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums">
                      {blocked ? (
                        <span className="text-red-400">required</span>
                      ) : p.sources.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        p.sources.length
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums">
                      {subjects === 0 ? <span className="text-muted">—</span> : subjects}
                    </td>
                    <td className="px-4 py-3">
                      {p.status === "PUBLISHED" ? (
                        <span className="font-mono text-[11px] text-positive">
                          live
                          {p.publishedAt && (
                            <span className="block text-muted">
                              {new Date(p.publishedAt).toISOString().slice(0, 10)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-muted">draft</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {/* A draft is readable at its own URL, by you, marked
                          noindex — so a piece about a real person gets
                          proofread on the page instead of by publishing it. */}
                      <Link
                        href={`/blog/${p.slug}`}
                        className="mr-3 text-xs text-muted hover:text-foreground"
                      >
                        {p.status === "PUBLISHED" ? "View ↗" : "Preview ↗"}
                      </Link>
                      <DeletePostButton
                        postId={p.id}
                        title={p.title}
                        published={p.status === "PUBLISHED"}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
