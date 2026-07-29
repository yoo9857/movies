import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import {
  breadcrumbNode,
  criticEntityId,
  type Crumb,
  graph,
  itemListNode,
  pageMetadata,
  webPageNode,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "The film critics CinePixo follows — the writers whose reviews shaped how this community reads a film.";

export const metadata: Metadata = pageMetadata({
  path: "/critics",
  title: "Critics",
  description: DESCRIPTION,
  keywords: ["film critics", "film criticism", "critic profiles"],
});

const TRAIL: Crumb[] = [{ name: "Critics" }];

export default async function CriticsPage() {
  const critics = await prisma.critic.findMany({ orderBy: { name: "asc" } });

  const jsonLd = graph(
    webPageNode({
      path: "/critics",
      name: "Critics",
      description: DESCRIPTION,
      kind: "CollectionPage",
      hasBreadcrumb: true,
      dateModified: critics[0]?.updatedAt,
    }),
    breadcrumbNode("/critics", TRAIL),
    critics.length > 0 &&
      itemListNode({
        path: "/critics",
        name: "Critics",
        description: DESCRIPTION,
        entries: critics.map((c) => ({
          path: `/critics/${c.slug}`,
          name: c.name,
          image: c.avatarUrl,
          entityId: criticEntityId(c.slug),
        })),
      }),
  );

  return (
    <div>
      <JsonLd data={jsonLd} />
      <h1 className="text-2xl font-bold">Critics</h1>
      <p className="mt-1 text-sm text-muted">
        The writers whose reviews shaped how this community reads a film.
      </p>

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
