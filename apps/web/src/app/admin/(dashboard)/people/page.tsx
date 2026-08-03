import { prisma } from "@cinepixo/db";
import Link from "next/link";
import { EnrichAllButton } from "@/components/admin/EnrichAllButton";
import { ImportPortraitsButton } from "@/components/admin/ImportPortraitsButton";
import { PersonPhotoManager } from "@/components/admin/PersonPhotoManager";
import { PersonPortrait } from "@/components/PersonPortrait";

/**
 * The portrait desk.
 *
 * Ordered by what needs doing: people with no photograph at all come first,
 * because that is the work. A list sorted alphabetically hides the gap in the
 * middle of the alphabet; this one puts it at the top and counts it.
 *
 * It used to do that by loading **every** person — `findMany` with no `take`,
 * plus a credits count per row — and rendering all of them in one table. Fine at
 * a few hundred; after the Wikidata import that is 208,148 rows, 416,296
 * correlated subqueries, a 208,148-row sort in JavaScript, ~27,000 `next/image`
 * optimisations and a client component per row. Opening this page took the whole
 * site down on 2026-08-03: the server reached 1.5 GB, stalled at 0% CPU, and
 * nginx answered 504 on every URL including the public ones.
 *
 * The film desk had already learned this and been paged; this page was missed.
 * Fifty rows now, with a name search served by the trigram index.
 *
 * The header counts are four aggregates rather than four passes over an array
 * that no longer exists in memory. `credits` is still per row, which is cheap for
 * fifty of them — but it is deliberately **not** in the ORDER BY any more, since
 * sorting on it means computing it for all 208,148. Photograph state orders the
 * page, which is what the desk is for; name breaks the tie.
 */

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function AdminPeoplePage(props: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await props.searchParams;
  const q = (sp.q ?? "").slice(0, 80).trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};

  const [rows, total, ours, pendingImport, needResearch, pendingWiki] = await Promise.all([
    prisma.person.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        image: true,
        tmdbProfilePath: true,
        bio: true,
        notes: true,
        wikidataId: true,
        _count: { select: { castRoles: true, crewRoles: true } },
      },
      // Work first, in the order the old JS `rank` put it: nothing at all, then
      // an unimported source, then finished. Both keys are NULLS FIRST — a null
      // `image` is "no photograph", and among those a null `tmdbProfilePath` is
      // the person nobody can fix without research, which is the top of the pile.
      // Getting this backwards buries the actual work behind 27,000 rows that
      // only need a button pressed.
      orderBy: [
        { image: { sort: "asc", nulls: "first" } },
        { tmdbProfilePath: { sort: "asc", nulls: "first" } },
        { name: "asc" },
      ],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.person.count({ where }),
    prisma.person.count({ where: { image: { not: null } } }),
    prisma.person.count({ where: { image: null, tmdbProfilePath: { not: null } } }),
    prisma.person.count({ where: { image: null, tmdbProfilePath: null } }),
    // "Credited but unlinked" is the queue the Wikipedia pass works through.
    prisma.person.count({
      where: {
        wikidataId: null,
        OR: [{ castRoles: { some: {} } }, { crewRoles: { some: {} } }],
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageHref = (p: number) =>
    `/admin/people?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">People</h1>
        <p className="font-mono text-xs text-muted">
          {ours.toLocaleString("en-US")} ours · {pendingWiki.toLocaleString("en-US")} unlinked ·{" "}
          {needResearch.toLocaleString("en-US")} need research
        </p>
      </div>

      {/* Wikipedia first — it brings the photograph, its credit, and the facts. */}
      <EnrichAllButton pending={pendingWiki} />
      <ImportPortraitsButton pending={pendingImport} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase text-muted">
          {total.toLocaleString("en-US")} {q ? `matching “${q}”` : "in the credit graph"}
        </h2>
        <form action="/admin/people" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search a name"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-sm">
            Search
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Credits</th>
              <th className="px-4 py-3">Written</th>
              <th className="px-4 py-3">Portrait</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const credits = p._count.castRoles + p._count.crewRoles;
              return (
                <tr key={p.id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <PersonPortrait person={p} size={40} />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/people/${p.id}`}
                          className="block truncate font-medium hover:text-accent"
                        >
                          {p.name}
                        </Link>
                        <Link
                          href={`/people/${p.slug}`}
                          className="block truncate font-mono text-[11px] text-muted hover:text-accent"
                        >
                          /{p.slug}
                        </Link>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{credits}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {/* What we have written is the whole point of owning the row. */}
                    {p.bio || p.notes ? (
                      <span className="text-accent">
                        {[p.bio && "bio", p.notes && "notes"].filter(Boolean).join(" + ")}
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  <td className="min-w-[19rem] px-4 py-3">
                    {p.image ? (
                      <p className="mb-1.5 font-mono text-[11px] text-accent">ours</p>
                    ) : p.tmdbProfilePath ? (
                      <p className="mb-1.5 font-mono text-[11px] text-muted">
                        source available — not imported
                      </p>
                    ) : (
                      <p className="mb-1.5 font-mono text-[11px] text-muted">
                        monogram — needs research
                      </p>
                    )}
                    <PersonPhotoManager personId={p.id} hasImage={Boolean(p.image)} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                  Nobody matches “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-lg border border-line px-3 py-1.5">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="font-mono text-xs text-muted">
            Page {page.toLocaleString("en-US")} of {totalPages.toLocaleString("en-US")}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="rounded-lg border border-line px-3 py-1.5">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
