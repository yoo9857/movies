import { prisma } from "@cinepixo/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [published, drafts, movies, critics, totalViews] = await Promise.all([
    prisma.review.count({ where: { status: "PUBLISHED" } }),
    prisma.review.count({ where: { status: "DRAFT" } }),
    prisma.movie.count(),
    prisma.critic.count(),
    prisma.review.aggregate({ _sum: { viewCount: true } }),
  ]);

  const stats = [
    { label: "Published reviews", value: published },
    { label: "Drafts", value: drafts },
    { label: "Movies", value: movies },
    { label: "Critics", value: critics },
    { label: "Total views", value: totalViews._sum.viewCount ?? 0 },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link
          href="/admin/reviews/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
        >
          + New review
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-2xl font-bold tabular-nums">{s.value}</p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
