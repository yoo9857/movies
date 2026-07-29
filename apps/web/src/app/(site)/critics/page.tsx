import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Critics" };

export default async function CriticsPage() {
  const critics = await prisma.critic.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-2xl font-bold">Critics</h1>
      <p className="mt-1 text-sm text-muted">The writers and voices this fandom celebrates.</p>

      {critics.length === 0 ? (
        <p className="mt-8 text-muted">No critics listed yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {critics.map((c) => (
            <Link
              key={c.slug}
              href={`/critics/${c.slug}`}
              className="group rounded-xl border border-line bg-surface p-5 transition-colors hover:border-accent-dim"
            >
              <h2 className="font-semibold group-hover:text-accent transition-colors">{c.name}</h2>
              {c.bio && <p className="mt-2 line-clamp-3 text-sm text-muted">{c.bio}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
