import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import {
  breadcrumbNode,
  type Crumb,
  graph,
  itemListNode,
  memberEntityId,
  pageMetadata,
  webPageNode,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "The writers publishing CinePixo reviews and editorial features, with their backgrounds and complete bylines.";

export const metadata: Metadata = pageMetadata({
  path: "/writers",
  title: "Writers",
  description: DESCRIPTION,
  keywords: ["CinePixo writers", "film review authors", "film journalists"],
});

const TRAIL: Crumb[] = [{ name: "Writers" }];

export default async function WritersPage() {
  const writers = await prisma.user.findMany({
    where: {
      OR: [
        { reviews: { some: { status: "PUBLISHED" } } },
        { posts: { some: { status: "PUBLISHED" } } },
      ],
    },
    orderBy: [{ displayName: "asc" }, { username: "asc" }],
    select: {
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      updatedAt: true,
      posts: {
        where: { status: "PUBLISHED" },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { updatedAt: true },
      },
      reviews: {
        where: { status: "PUBLISHED" },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { updatedAt: true },
      },
      _count: {
        select: {
          reviews: { where: { status: "PUBLISHED" } },
          posts: { where: { status: "PUBLISHED" } },
        },
      },
    },
  });
  const newestUpdate = writers.reduce<Date | undefined>(
    (newest, writer) => {
      const changed = [
        writer.updatedAt,
        writer.posts[0]?.updatedAt,
        writer.reviews[0]?.updatedAt,
      ].filter((date): date is Date => Boolean(date)).reduce(
        (latest, date) => (date > latest ? date : latest),
        writer.updatedAt,
      );
      return !newest || changed > newest ? changed : newest;
    },
    undefined,
  );

  const jsonLd = graph(
    webPageNode({
      path: "/writers",
      name: "Writers",
      description: DESCRIPTION,
      kind: "CollectionPage",
      dateModified: newestUpdate,
      hasBreadcrumb: true,
    }),
    breadcrumbNode("/writers", TRAIL),
    itemListNode({
      path: "/writers",
      name: "CinePixo writers",
      entries: writers.map((writer) => ({
        path: `/writers/${writer.username}`,
        name: writer.displayName ?? writer.username,
        image: writer.avatarUrl,
        entityId: memberEntityId(writer.username),
      })),
    }),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <JsonLd data={jsonLd} />
      <Breadcrumbs trail={TRAIL} />
      <header className="mt-3 border-b border-line pb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Bylines</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Writers</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">{DESCRIPTION}</p>
      </header>

      <div className="divide-y divide-line">
        {writers.map((writer) => {
          const name = writer.displayName ?? writer.username;
          return (
            <Link
              key={writer.username}
              href={`/writers/${writer.username}`}
              className="group flex items-start gap-4 py-7"
            >
              <Avatar src={writer.avatarUrl} name={name} size={64} />
              <span className="min-w-0 flex-1">
                <span className="text-xl font-semibold transition-colors group-hover:text-accent">
                  {name}
                </span>
                <span className="ml-2 font-mono text-[11px] text-muted">@{writer.username}</span>
                {writer.bio ? (
                  <span className="mt-2 line-clamp-3 block text-sm leading-relaxed text-muted">
                    {writer.bio}
                  </span>
                ) : (
                  <span className="mt-2 block text-sm leading-relaxed text-muted">
                    Biography awaiting editorial verification.
                  </span>
                )}
                <span className="mt-2 block font-mono text-[11px] text-muted">
                  {writer._count.posts} feature{writer._count.posts === 1 ? "" : "s"} ·{" "}
                  {writer._count.reviews} review{writer._count.reviews === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
