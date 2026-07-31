import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { monogram } from "@/lib/monogram";
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
        /* A masthead, not a product grid: the directory reads as a credits
           roll — numbered rows, a face or the house monogram, the name set
           large, the argument for them underneath. */
        <div className="mt-8">
          {critics.map((c, i) => (
            <Link
              key={c.slug}
              href={`/critics/${c.slug}`}
              className="group flex items-start gap-5 border-t border-line py-7 transition-colors last:border-b sm:gap-8"
            >
              <span
                aria-hidden="true"
                className="mt-1 hidden w-8 shrink-0 font-mono text-xs tracking-widest text-accent-dim sm:block"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="relative block size-16 shrink-0 overflow-hidden rounded-full border border-line bg-surface-raised sm:size-20">
                {c.avatarUrl ? (
                  <Image
                    src={c.avatarUrl}
                    alt={c.name}
                    fill
                    sizes="80px"
                    className="object-cover object-top"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center font-mono text-lg font-bold text-accent/85">
                    {monogram(c.name)}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight transition-colors group-hover:text-accent sm:text-2xl">
                  {c.name}
                </h2>
                {c.bio && (
                  <p className="mt-2 line-clamp-3 max-w-2xl text-sm leading-relaxed text-muted">
                    {c.bio}
                  </p>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
