import { prisma } from "@cinepixo/db";
import {
  POST_CATEGORY_BLURBS,
  POST_CATEGORY_LABELS,
  type PostCategory,
  postCategorySchema,
  postCategorySlug,
} from "@cinepixo/shared";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { PostRow } from "@/components/blog/PostRow";
import { ReelDivider, SectionHead } from "@/components/ReelDivider";
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
 * The blog front: what we have published lately, then one shelf per kind of
 * piece.
 *
 * Reviews cover one axis — an argument about a single film, scored. This is the
 * writing that has nowhere else to sit: what an actor is doing off camera, the
 * row a casting decision started, which five films to watch before the sequel.
 * The shelves are printed with their blurbs rather than as a bare tag row,
 * because a reader arriving from a search for one piece needs to be told what
 * else this place writes.
 */

// The page is per-request (the CSP nonce alone rules out a static one), but the
// read behind it is not: see `frontPosts`.
export const dynamic = "force-dynamic";

const LATEST = 8;
const PER_SHELF = 3;

/** Offered on every blog page, ahead of the site-wide feed. */
export const BLOG_FEED = [{ path: "/blog/feed.xml", title: "Off Camera — the CinePixo blog" }] as const;

const postSelect = {
  slug: true,
  title: true,
  dek: true,
  category: true,
  publishedAt: true,
  image: true,
  imageAlt: true,
  author: { select: { username: true, displayName: true } },
} as const;

/**
 * The front page's one query, cached for a minute.
 *
 * Publishing is a person typing a command a few times a week; a visitor is not.
 * Reading the same 23 rows out of PostgreSQL for every arrival was the only
 * uncached listing left on the site — `/movies` and `/people` have wrapped
 * their reads since they were built. A minute is short enough that a piece
 * published now appears while the author is still looking at it, and long
 * enough that a link doing well costs one query rather than thousands.
 *
 * Tagged so publishing can drop it deliberately as well as waiting it out.
 */
const frontPosts = unstable_cache(
  () =>
    prisma.post.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      // Enough to fill the strip and every shelf even if one category dominates.
      take: LATEST + postCategorySchema.options.length * PER_SHELF,
      select: postSelect,
    }),
  ["blog-front"],
  { revalidate: 60, tags: ["posts"] },
);

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    path: "/blog",
    title: "Off Camera — the CinePixo blog",
    description:
      "Film writing that isn't a review: the people who make films away from the film, the arguments the industry is having, how pictures get made, and what to watch next.",
    keywords: [
      "film blog",
      "movie news",
      "actor interviews",
      "film industry",
      "what to watch",
    ],
    feeds: BLOG_FEED,
  });
}

export default async function BlogPage() {
  // One query for the front page, sliced in memory. The alternative is six
  // queries — latest plus one per shelf — to render at most 23 rows, and the
  // shelves are the same rows the latest strip already read.
  const posts = await frontPosts();

  const latest = posts.slice(0, LATEST);
  const shelves = postCategorySchema.options
    .map((category) => ({
      category,
      posts: posts.filter((p) => p.category === category).slice(0, PER_SHELF),
    }))
    // An empty shelf is a heading promising writing that does not exist.
    .filter((s) => s.posts.length > 0);

  const path = "/blog";
  const trail: Crumb[] = [{ name: "Off Camera" }];

  const jsonLd = graph(
    webPageNode({
      path,
      name: "Off Camera — the CinePixo blog",
      description:
        "Film writing that isn't a review: people, arguments, craft and watchlists.",
      kind: "CollectionPage",
      dateModified: latest[0]?.publishedAt,
      hasBreadcrumb: true,
      mainEntityId: blogNode()["@id"] as string,
    }),
    breadcrumbNode(path, trail),
    blogNode(),
    latest.length > 0 &&
      itemListNode({
        path,
        name: "Latest posts",
        entries: latest.map((p) => ({
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

      <header>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
          The blog
        </span>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Off Camera</h1>
        <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-muted">
          Film writing that isn&rsquo;t a review — the people who make pictures away from the
          picture, the arguments the industry is having, how the work gets done, and what to
          watch next. Everything here is ours, and everything that makes a claim about a
          person says where the claim came from.
        </p>
      </header>

      <ReelDivider className="my-9" />

      {posts.length === 0 ? (
        <p className="text-muted">Nothing published yet.</p>
      ) : (
        <div className="space-y-14">
          <section>
            <SectionHead>Latest</SectionHead>
            <div className="mt-4 divide-y divide-line border-y border-line">
              {latest.map((p) => (
                <PostRow key={p.slug} post={p} />
              ))}
            </div>
          </section>

          {shelves.map((shelf) => (
            <Shelf key={shelf.category} category={shelf.category} posts={shelf.posts} />
          ))}
        </div>
      )}
    </div>
  );
}

function Shelf({
  category,
  posts,
}: {
  category: PostCategory;
  posts: React.ComponentProps<typeof PostRow>["post"][];
}) {
  const href = `/blog/category/${postCategorySlug(category)}`;
  return (
    <section>
      <SectionHead
        action={
          <Link href={href} className="text-sm text-accent hover:opacity-80">
            All of it →
          </Link>
        }
      >
        {POST_CATEGORY_LABELS[category]}
      </SectionHead>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        {POST_CATEGORY_BLURBS[category]}
      </p>
      <div className="mt-4 divide-y divide-line border-y border-line">
        {posts.map((p) => (
          <PostRow key={p.slug} post={p} />
        ))}
      </div>
    </section>
  );
}
