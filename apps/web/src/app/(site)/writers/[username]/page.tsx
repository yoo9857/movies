import { prisma } from "@cinepixo/db";
import { toStarScale, usernameSchema } from "@cinepixo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Avatar } from "@/components/Avatar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { PostRow } from "@/components/blog/PostRow";
import { Poster } from "@/components/Poster";
import { ReelDivider, SectionHead } from "@/components/ReelDivider";
import {
  breadcrumbNode,
  type Crumb,
  graph,
  itemListNode,
  memberEntityId,
  memberNode,
  pageMetadata,
  webPageNode,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

const getWriter = cache(async (rawUsername: string) => {
  const parsed = usernameSchema.safeParse(rawUsername);
  if (!parsed.success) return null;
  return prisma.user.findUnique({
    where: { username: parsed.data },
    select: {
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      updatedAt: true,
      posts: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        select: {
          slug: true,
          title: true,
          dek: true,
          category: true,
          format: true,
          publishedAt: true,
          image: true,
          imageAlt: true,
          updatedAt: true,
          author: { select: { username: true, displayName: true } },
        },
      },
      reviews: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        select: {
          slug: true,
          title: true,
          rating: true,
          publishedAt: true,
          updatedAt: true,
          movie: { select: { title: true, posterPath: true, image: true } },
        },
      },
      _count: {
        select: {
          posts: { where: { status: "PUBLISHED" } },
          reviews: { where: { status: "PUBLISHED" } },
        },
      },
    },
  });
});

export async function generateMetadata(props: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await props.params;
  const writer = await getWriter(username);
  if (!writer || writer._count.posts + writer._count.reviews === 0) notFound();
  const name = writer.displayName ?? writer.username;
  return pageMetadata({
    path: `/writers/${writer.username}`,
    title: name,
    description: writer.bio ?? `${name}, a writer publishing film criticism and features at CinePixo.`,
    ogType: "profile",
    images: writer.avatarUrl ? [{ url: writer.avatarUrl, alt: name }] : [],
    keywords: [name, `${name} film reviews`, "CinePixo writer"],
  });
}

export default async function WriterPage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;
  const writer = await getWriter(username);
  if (!writer || writer._count.posts + writer._count.reviews === 0) notFound();

  const name = writer.displayName ?? writer.username;
  const desk = writer.username === "cinepixo";
  const path = `/writers/${writer.username}`;
  const dateModified = [
    writer.updatedAt,
    ...writer.posts.map((post) => post.updatedAt),
    ...writer.reviews.map((review) => review.updatedAt),
  ].reduce((latest, date) => (date > latest ? date : latest), writer.updatedAt);
  const trail: Crumb[] = [{ name: "Writers", path: "/writers" }, { name }];
  const work = [
    ...writer.posts.map((post) => ({ path: `/blog/${post.slug}`, name: post.title })),
    ...writer.reviews.map((review) => ({ path: `/reviews/${review.slug}`, name: review.title })),
  ];
  const jsonLd = graph(
    webPageNode({
      path,
      name,
      description: writer.bio,
      kind: "ProfilePage",
      dateModified,
      hasBreadcrumb: true,
      mainEntityId: memberEntityId(writer.username),
      aboutId: memberEntityId(writer.username),
      image: writer.avatarUrl,
    }),
    breadcrumbNode(path, trail),
    memberNode(writer),
    itemListNode({ path, name: `${name}'s work`, entries: work }),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <JsonLd data={jsonLd} />
      <Breadcrumbs trail={trail} />
      <header className="mt-4 flex items-start gap-5 border-b border-line pb-8">
        <Avatar src={writer.avatarUrl} name={name} size={88} />
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            {desk ? "Editorial desk" : "Writer"}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{name}</h1>
          <p className="mt-1 font-mono text-xs text-muted">@{writer.username}</p>
          <p className="mt-4 leading-relaxed text-foreground/90">
            {writer.bio ?? "Biography awaiting editorial verification."}
          </p>
          <p className="mt-3 font-mono text-xs text-muted">
            {writer._count.posts} feature{writer._count.posts === 1 ? "" : "s"} ·{" "}
            {writer._count.reviews} review{writer._count.reviews === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      {writer.posts.length > 0 && (
        <section className="mt-10">
          <SectionHead>Features</SectionHead>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {writer.posts.map((post) => <PostRow key={post.slug} post={post} />)}
          </div>
        </section>
      )}

      {writer.posts.length > 0 && writer.reviews.length > 0 && <ReelDivider className="my-10" />}

      {writer.reviews.length > 0 && (
        <section className={writer.posts.length > 0 ? undefined : "mt-10"}>
          <SectionHead>Reviews</SectionHead>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {writer.reviews.map((review) => (
              <li key={review.slug}>
                <Link href={`/reviews/${review.slug}`} className="group flex items-center gap-3 py-3">
                  <Poster
                    path={review.movie.posterPath}
                    image={review.movie.image}
                    title={review.movie.title}
                    className="h-12 w-8 shrink-0 rounded object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium transition-colors group-hover:text-accent">
                      {review.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{review.movie.title}</span>
                  </span>
                  <span className="font-mono text-xs text-accent">
                    ★{toStarScale(review.rating).toFixed(1)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 border-t border-line pt-6 text-sm leading-relaxed text-muted">
        Every feature follows the <Link href="/editorial" className="text-accent hover:opacity-80">CinePixo editorial standards</Link>.
        Content format labels describe the evidence on the page; they are not promotional badges.
      </p>
    </div>
  );
}
