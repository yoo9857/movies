import { prisma } from "@cinepixo/db";
import Link from "next/link";
import { DeleteCriticButton } from "@/components/admin/DeleteCriticButton";

export const dynamic = "force-dynamic";

export default async function AdminCriticsPage() {
  const critics = await prisma.critic.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Critics</h1>
        <Link
          href="/admin/critics/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
        >
          + Add critic
        </Link>
      </div>

      {critics.length === 0 ? (
        <p className="mt-8 text-muted">No critics yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Bio</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {critics.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{c.slug}</td>
                  <td className="max-w-md px-4 py-3 text-muted">
                    <span className="line-clamp-1">{c.bio ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/critics/${c.slug}`}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        View
                      </Link>
                      <Link
                        href={`/admin/critics/${c.id}/edit`}
                        className="text-xs text-accent hover:opacity-80"
                      >
                        Edit
                      </Link>
                      <DeleteCriticButton criticId={c.id} name={c.name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
