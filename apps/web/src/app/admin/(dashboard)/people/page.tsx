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
 */

export const dynamic = "force-dynamic";

export default async function AdminPeoplePage() {
  const people = await prisma.person.findMany({
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
    orderBy: { name: "asc" },
  });

  const credited = people.filter((p) => p._count.castRoles + p._count.crewRoles > 0);
  const pendingWiki = credited.filter((p) => !p.wikidataId).length;
  const pendingImport = people.filter((p) => !p.image && p.tmdbProfilePath).length;
  const needResearch = people.filter((p) => !p.image && !p.tmdbProfilePath);
  const ours = people.filter((p) => p.image);

  // Work first, then the imported, then the finished.
  const rank = (p: (typeof people)[number]) =>
    p.image ? 2 : p.tmdbProfilePath ? 1 : 0;
  const ordered = [...people].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b._count.castRoles + b._count.crewRoles - (a._count.castRoles + a._count.crewRoles) ||
      a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">People</h1>
        <p className="font-mono text-xs text-muted">
          {ours.length} ours · {pendingWiki} unlinked · {needResearch.length} need research
        </p>
      </div>

      {/* Wikipedia first — it brings the photograph, its credit, and the facts. */}
      <EnrichAllButton pending={pendingWiki} />
      <ImportPortraitsButton pending={pendingImport} />

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
            {ordered.map((p) => {
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
