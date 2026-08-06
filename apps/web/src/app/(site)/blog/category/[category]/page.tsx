import { prisma } from "@cinepixo/db";
import {
  POST_CATEGORY_BLURBS,
  POST_CATEGORY_LABELS,
  type PostCategory,
  paginationSchema,
  postCategoryFromSlug,
  postCategorySlug,
  postCategorySchema,
} from "@cinepixo/shared";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { PostRow } from "@/components/blog/PostRow";
import { BLOG_FEED } from "../../page";
import { ReelDivider } from "@/components/ReelDivider";
import {
  blogNode,
  breadcrumbNode,
  type Crumb,
  graph,
  hosted,
  itemListNode,
  pageMetadata,
  postEntityId,
  webPageNode,
} from "@/lib/seo";

/**
 * One shelf of the blog, paginated.
 *
 * `/blog/category/people` rather than `/blog/people`, because `/blog/[slug]` is
 * a post and two dynamic segments cannot share a level — and because a post's
 * URL is its identity, minted once and never rewritten, so it must not move when
 * the piece is recategorised. The extra segment is the price of that guarantee,
 * and it is the form WordPress and Tistory both settled on.
 */

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/** Page 1 is the bare shelf; page 2+ carry the query and self-canonicalise. */
function pathFor(slug: string, page: number): string {
  return page > 1 ? `/blog/category/${slug}?page=${page}` : `/blog/category/${slug}`;
}

/**
 * One shelf page, cached for a minute and keyed by (category, page).
 *
 * `cache()` on top of it because `generateMetadata` and the body both ask for
 * the same shelf within one request — that de-duplicates the call; the
 * `unstable_cache` underneath is what stops every visitor to a shelf costing a
 * count plus a page scan.
 */
const readShelf = unstable_cache(
  async (category: PostCategory, page: number) => {
    const where = { status: "PUBLISHED" as const, category };
    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          slug: true,
          title: true,
          dek: true,
          category: true,
          publishedAt: true,
          image: true,
          imageAlt: true,
          author: { select: { username: true, displayName: true } },
        },
      }),
    ]);
    return { total, posts };
  },
  ["blog-shelf"],
  { revalidate: 60, tags: ["posts"] },
);

const getShelf = cache(async (raw: string, page: number) => {
  const category = postCategoryFromSlug(raw);
  if (!category) return null;
  return { category, ...(await readShelf(category, page)) };
});

export async function generateMetadata(props: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const [{ category: raw }, sp] = await Promise.all([props.params, props.searchParams]);
  const { page } = paginationSchema.parse({ page: sp.page });
  const shelf = await getShelf(raw, page);
  // Thrown here too, so a bot given blocking metadata gets a real 404.
  if (!shelf) notFound();

  const label = POST_CATEGORY_LABELS[shelf.category];
  return pageMetadata({
    // Self-canonical rather than a canonical back to page 1: page 3 holds posts
    // that exist nowhere else, and pointing it at page 1 would drop them.
    path: pathFor(raw, page),
    title: page > 1 ? `${label} — page ${page}` : label,
    description: POST_CATEGORY_BLURBS[shelf.category],
    keywords: [label, "film blog", "CinePixo"],
    feeds: BLOG_FEED,
  });
}

export default async function ShelfPage(props: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ category: raw }, sp] = await Promise.all([props.params, props.searchParams]);
  const { page } = paginationSchema.parse({ page: sp.page });
  const shelf = await getShelf(raw, page);
  if (!shelf) notFound();

  const { category, total, posts } = shelf;
  const label = POST_CATEGORY_LABELS[category];
  const blurb = POST_CATEGORY_BLURBS[category];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const path = pathFor(raw, page);
  const trail: Crumb[] = [
    { name: "Off Camera", path: "/blog" },
    { name: label, ...(page > 1 ? { path: `/blog/category/${raw}` } : {}) },
    ...(page > 1 ? [{ name: `Page ${page}` }] : []),
  ];

  const jsonLd = graph(
    webPageNode({
      path,
      name: page > 1 ? `${label} — page ${page}` : label,
      description: blurb,
      kind: "CollectionPage",
      dateModified: posts[0]?.publishedAt,
      hasBreadcrumb: true,
    }),
    breadcrumbNode(path, trail),
    blogNode(),
    posts.length > 0 &&
      itemListNode({
        path,
        name: label,
        description: blurb,
        // Positions stay continuous across pages, so entry 21 on page 2 is
        // genuinely the 21st post and not the 1st again.
        startAt: (page - 1) * PAGE_SIZE + 1,
        totalItems: total,
        entries: posts.map((p) => ({
          path: `/blog/${p.slug}`,
          name: p.title,
          image: hosted(p.image),
          entityId: postEntityId(p.slug),
        })),
      }),
  );

  return (
    <div>
      <JsonLd data={jsonLd} />
      <Breadcrumbs trail={trail} />

      <header className="mt-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
          Off Camera
        </span>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{label}</h1>
        <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-muted">{blurb}</p>
        <p className="mt-3 font-mono text-xs text-muted">
          {total} published · newest first
        </p>
      </header>

      <ReelDivider className="my-9" />

      {posts.length === 0 ? (
        <p className="text-muted">Nothing on this shelf yet.</p>
      ) : (
        <div className="divide-y divide-line border-y border-line">
          {posts.map((p) => (
            <PostRow key={p.slug} post={p} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav
          className="mt-8 flex items-baseline justify-between font-mono text-sm"
          aria-label="Pagination"
        >
          {page > 1 ? (
            <Link href={pathFor(raw, page - 1)} className="text-muted hover:text-foreground">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pathFor(raw, page + 1)} className="text-muted hover:text-foreground">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <ReelDivider className="my-10" />

      <nav aria-label="Other shelves">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          The other shelves
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {postCategorySchema.options
            .filter((c) => c !== category)
            .map((c) => (
              <Link
                key={c}
                href={`/blog/category/${postCategorySlug(c)}`}
                className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted transition-colors hover:border-accent-dim hover:text-foreground"
              >
                {POST_CATEGORY_LABELS[c]}
              </Link>
            ))}
        </div>
      </nav>
    </div>
  );
}
