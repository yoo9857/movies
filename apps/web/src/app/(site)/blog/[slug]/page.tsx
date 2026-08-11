import { prisma } from "@cinepixo/db";
import {
  POST_CATEGORY_LABELS,
  type PostCategory,
  extractHeadings,
  postCategorySlug,
  readingMinutes,
  slugSchema,
  sourceHost,
} from "@cinepixo/shared";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { AdSlot } from "@/components/ads/AdSlot";
import { Avatar } from "@/components/Avatar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { PersonPortrait } from "@/components/PersonPortrait";
import { Poster } from "@/components/Poster";
import { ReelDivider, SectionHead } from "@/components/ReelDivider";
import { MarkdownProse } from "@/components/review/ReviewBody";
import { ShareRow } from "@/components/review/ShareRow";
import { PostRow } from "@/components/blog/PostRow";
import { BLOG_FEED } from "../page";
import { isAdmin } from "@/lib/auth";
import {
  absUrl,
  blogNode,
  breadcrumbNode,
  type Crumb,
  graph,
  hasCompleteImageMetadata,
  hosted,
  movieEntityId,
  pageMetadata,
  peopleEntityId,
  postEntityId,
  postNode,
  primaryImageId,
  webPageNode,
} from "@/lib/seo";

/**
 * One blog post.
 *
 * The shape is a newspaper feature, not a review: eyebrow, headline,
 * standfirst, byline, hero, body — then the two things a review page has no
 * equivalent for.
 *
 *  · **Sources.** A piece filed under Away From Set or The Argument is a factual
 *    claim about a living person, and the database refuses to publish one with
 *    an empty `sources` array (`Post_claims_are_sourced`). This page prints
 *    every URL in that array. The constraint and this section are one feature in
 *    two halves: a citation the database demands and the page hides is a lie
 *    told to the schema.
 *  · **Who and what it is about.** The `PostPerson` / `PostMovie` links render
 *    as real links to our own pages, and those pages link back. That reciprocal
 *    pair is the whole reason the blog is worth building next to a library —
 *    a piece about an actor makes their page worth crawling, and their page
 *    makes the piece findable.
 */

export const dynamic = "force-dynamic";

/**
 * The post, published or not.
 *
 * Status is checked by the caller rather than in the `where` clause, because an
 * admin has to be able to read a draft *on the page* before it goes live. A piece
 * that makes a claim about a real person is exactly the piece that should not be
 * proofread by publishing it and looking — and the alternative, a separate
 * preview route, would be a second renderer to keep in step with this one.
 *
 * Everything else still keys on PUBLISHED: the shelves, the sitemap, the feeds,
 * the .md endpoint and the share card. A draft is visible at its URL to one
 * account and is marked `noindex` while it is.
 */
/**
 * What else to read, resolved after the piece has already streamed.
 *
 * Two queries: more from the same shelf, and anything else written about the
 * same people — the second is the one a tag cloud cannot answer, and the
 * reciprocal link that makes a person's page worth crawling. Both are
 * navigation, so neither belongs on the critical path of the article itself.
 *
 * Cached by shelf and subject rather than by post: two pieces about the same
 * actor want the same answer.
 */
const relatedFor = unstable_cache(
  async (postId: string, category: PostCategory, peopleSlugs: string[]) =>
    Promise.all([
      prisma.post.findMany({
        where: { status: "PUBLISHED", category, NOT: { id: postId } },
        orderBy: { publishedAt: "desc" },
        take: 4,
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
      peopleSlugs.length === 0
        ? Promise.resolve([])
        : prisma.post.findMany({
            where: {
              status: "PUBLISHED",
              NOT: { id: postId },
              people: { some: { person: { slug: { in: peopleSlugs } } } },
            },
            orderBy: { publishedAt: "desc" },
            take: 4,
            select: { slug: true, title: true, publishedAt: true },
          }),
    ]),
  ["blog-related"],
  { revalidate: 300, tags: ["posts"] },
);

/** Height held while the two queries run, so the footer does not jump. */
function RelatedFallback() {
  return <div className="h-40" aria-hidden="true" />;
}

async function Related({
  postId,
  category,
  peopleSlugs,
  leadName,
}: {
  postId: string;
  category: PostCategory;
  peopleSlugs: string[];
  leadName?: string;
}) {
  const [alsoOnShelf, alsoAboutThem] = await relatedFor(postId, category, peopleSlugs);

  return (
    <>
      {alsoAboutThem.length > 0 && (
        <section>
          <SectionHead>Also written about {leadName}</SectionHead>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {alsoAboutThem.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/blog/${p.slug}`}
                  className="group flex items-baseline justify-between gap-4 py-3 text-sm"
                >
                  <span className="min-w-0 font-medium transition-colors group-hover:text-accent">
                    {p.title}
                  </span>
                  {p.publishedAt && (
                    <time
                      dateTime={new Date(p.publishedAt).toISOString()}
                      className="shrink-0 font-mono text-xs text-muted"
                    >
                      {new Date(p.publishedAt).toLocaleDateString("en-US", {
                        dateStyle: "medium",
                      })}
                    </time>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {alsoOnShelf.length > 0 && (
        <section>
          <SectionHead
            action={
              <Link
                href={`/blog/category/${postCategorySlug(category)}`}
                className="text-sm text-accent hover:opacity-80"
              >
                All of it →
              </Link>
            }
          >
            More {POST_CATEGORY_LABELS[category]}
          </SectionHead>
          <div className="mt-3 divide-y divide-line border-y border-line">
            {alsoOnShelf.map((p) => (
              <PostRow key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

const getPost = cache(async (rawSlug: string) => {
  const parsed = slugSchema.safeParse(rawSlug);
  if (!parsed.success) return null;
  return prisma.post.findFirst({
    where: { slug: parsed.data },
    include: {
      author: {
        select: { id: true, username: true, displayName: true, bio: true, avatarUrl: true },
      },
      people: {
        orderBy: { sort: "asc" },
        select: {
          person: {
            select: { slug: true, name: true, image: true, occupations: true, bio: true },
          },
        },
      },
      movies: {
        orderBy: { sort: "asc" },
        select: {
          movie: {
            select: {
              slug: true,
              title: true,
              releaseDate: true,
              director: true,
              posterPath: true,
              image: true,
            },
          },
        },
      },
    },
  });
});

function trailFor(post: { title: string; category: keyof typeof POST_CATEGORY_LABELS }): Crumb[] {
  return [
    { name: "Off Camera", path: "/blog" },
    {
      name: POST_CATEGORY_LABELS[post.category],
      path: `/blog/category/${postCategorySlug(post.category)}`,
    },
    { name: post.title },
  ];
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const post = await getPost(slug);
  // Thrown here as well as in the page: for bots given blocking metadata this
  // is what makes a missing post a real 404 rather than a soft one.
  if (!post) notFound();
  // A draft is nobody's page but the desk's. Checked before the row is used for
  // anything, so an unpublished headline never reaches a crawler's <title>.
  if (post.status !== "PUBLISHED" && !(await isAdmin())) notFound();

  const author = post.author.displayName ?? post.author.username;
  const draft = post.status !== "PUBLISHED";
  const hero = hosted(post.image);

  return pageMetadata({
    path: `/blog/${post.slug}`,
    title: draft ? `[draft] ${post.title}` : post.title,
    // Belt and braces. Only an admin can load a draft at all, but a preview URL
    // pasted into a chat window is exactly how an unfinished claim about a real
    // person gets indexed.
    noIndex: draft,
    description:
      post.dek ?? `${author} on ${POST_CATEGORY_LABELS[post.category].toLowerCase()}, for CinePixo.`,
    ogType: "article",
    // The photograph the article actually leads with is the clearest primary-
    // image signal for image search. It also keeps Open Graph, the image
    // sitemap and the BlogPosting node pointed at the same object. A post with
    // no hero gets the site card explicitly: file-based metadata does not
    // inherit into a dynamic child segment in Next.js.
    images: hero
      ? [{ url: hero, alt: post.imageAlt ?? post.title }]
      : [{ url: absUrl("/opengraph-image.png"), alt: "CinePixo" }],
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    authors: [author],
    section: POST_CATEGORY_LABELS[post.category],
    tags: [
      ...post.tags,
      ...post.people.map((p) => p.person.name),
      ...post.movies.map((m) => m.movie.title),
    ],
    // Only what the page prints: the tag row, the people and the films are all
    // rendered below.
    keywords: [...post.tags, ...post.people.map((p) => p.person.name)],
    markdownPath: `/blog/${post.slug}.md`,
    feeds: BLOG_FEED,
  });
}

export default async function PostPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const post = await getPost(slug);
  if (!post) notFound();

  const draft = post.status !== "PUBLISHED";
  if (draft && !(await isAdmin())) notFound();

  // Fire-and-forget; the render never waits or fails on it. Raw SQL rather than
  // `update` because Prisma's @updatedAt fires on any update — and `updatedAt`
  // is what the graph publishes as dateModified and the sitemap as lastmod. A
  // timestamp that moves on every crawl is one crawlers learn to ignore.
  //
  // Not counted for a draft: the only reader is the person who wrote it, and a
  // view count inflated by proofreading is a number that means nothing.
  if (!draft) {
    prisma
      .$executeRaw`UPDATE "Post" SET "viewCount" = "viewCount" + 1 WHERE id = ${post.id}`
      .catch(() => {});
  }

  const path = `/blog/${post.slug}`;
  const url = absUrl(path);
  const author = post.author.displayName ?? post.author.username;
  const date = post.publishedAt ? new Date(post.publishedAt) : null;
  const minutes = readingMinutes(post.content);
  const headings = extractHeadings(post.content);
  const hasContents = headings.length >= 3;
  const trail = trailFor(post);
  const people = post.people.map((p) => p.person);
  const films = post.movies.map((m) => m.movie);

  // `about` first, `mentions` after — the curated sort order, honoured. A piece
  // on one actor should not claim to be equally about the six films under it.
  const subjectIds = [
    ...people.map((p) => peopleEntityId(p.slug)),
    ...films.map((f) => movieEntityId(f.slug)),
  ];

  const jsonLd = graph(
    webPageNode({
      path,
      name: post.title,
      description: post.dek,
      kind: "ItemPage",
      image: hosted(post.image),
      // The hero is described in full on the BlogPosting below — credit,
      // licence, the page it came from — so this points at that node instead of
      // repeating the file as a second, thinner ImageObject. A draft emits no
      // BlogPosting, so on a draft there is nothing to point at.
      imageId:
        !draft && hasCompleteImageMetadata({
          url: post.image,
          licenseUrl: post.imageLicenseUrl,
          sourceUrl: post.imageSourceUrl,
        })
          ? primaryImageId(path)
          : undefined,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      hasBreadcrumb: true,
      aboutId: subjectIds[0],
      mainEntityId: postEntityId(post.slug),
      keywords: [...post.tags, ...people.map((p) => p.name)],
      // The standfirst, and nothing else: an assistant reading this page aloud
      // should give the claim, not the navigation.
      speakableSelectors: ["[data-speakable]"],
      markdownUrl: absUrl(`${path}.md`),
    }),
    breadcrumbNode(path, trail),
    blogNode(),
    // A draft has no publication date, so `postNode` would emit a BlogPosting
    // with no `datePublished` — a shape worth not putting on the wire at all,
    // even behind a noindex.
    !draft &&
    postNode(
      {
        ...post,
        categoryLabel: POST_CATEGORY_LABELS[post.category],
      },
      { author: post.author, includeBody: true, subjectIds },
    ),
  );

  const contentsList = (
    <ol className="mt-2.5 space-y-1.5 text-sm">
      {headings.map((h, i) => (
        <li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
          <a
            href={`#${h.id}`}
            className="flex gap-2.5 text-muted transition-colors hover:text-accent"
          >
            <span className="font-mono text-[11px] tabular-nums opacity-60">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{h.text}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <JsonLd data={jsonLd} />

      <div
        className={
          hasContents
            ? "xl:relative xl:left-1/2 xl:w-[min(76rem,100vw-3rem)] xl:-translate-x-1/2 xl:grid xl:grid-cols-[minmax(0,1fr)_17rem] xl:gap-12"
            : undefined
        }
      >
        <article className="mx-auto w-full max-w-3xl min-w-0">
          {draft && (
            <p className="mb-5 rounded-lg border border-accent bg-surface px-4 py-3 text-sm">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                Draft
              </span>
              <span className="ml-3 text-muted">
                Visible to you only, and marked <code className="font-mono">noindex</code>. It is
                on no shelf, in no feed and in no sitemap until it is published.
              </span>{" "}
              <Link
                href={`/admin/blog/${post.id}/edit`}
                className="text-accent hover:opacity-80"
              >
                Edit →
              </Link>
            </p>
          )}
          <header>
            <Breadcrumbs trail={trail} />
            <Link
              href={`/blog/category/${postCategorySlug(post.category)}`}
              className="mt-2.5 inline-block font-mono text-[11px] uppercase tracking-[0.16em] text-accent hover:opacity-80"
            >
              {POST_CATEGORY_LABELS[post.category]}
            </Link>
            <h1 className="mt-1.5 text-balance text-[clamp(1.8rem,5vw,2.9rem)] font-bold leading-[1.12] tracking-tight">
              {post.title}
            </h1>
            {post.dek && (
              <p data-speakable className="mt-3 text-lg leading-relaxed text-muted">
                {post.dek}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-muted">
              <span>
                by <span className="font-semibold text-foreground/90">{author}</span>
              </span>
              {date && (
                <time dateTime={date.toISOString()}>
                  {date.toLocaleDateString("en-US", { dateStyle: "long" })}
                </time>
              )}
              <span>{minutes} min read</span>
              {post.viewCount > 0 && <span>{post.viewCount.toLocaleString("en-US")} views</span>}
            </div>
          </header>

          {/* ── The hero, with the terms a free licence travels with ── */}
          {post.image && (
            <figure className="mt-7">
              <Image
                src={post.image}
                alt={post.imageAlt ?? ""}
                width={1200}
                height={800}
                priority
                sizes="(min-width: 768px) 48rem, 100vw"
                className="w-full rounded-xl border border-line object-cover"
              />
              {(post.imageAlt || post.imageCredit) && (
                <figcaption className="cx-credit mt-2 block">
                  {post.imageAlt}
                  {post.imageAlt && post.imageCredit ? " · " : ""}
                  {/* The credit links to the file's own page, as it does under a
                      portrait. That link is what the markup publishes as
                      `acquireLicensePage`, and a licence whose terms a reader
                      cannot reach is an attribution, not a licence. */}
                  {post.imageCredit && post.imageSourceUrl ? (
                    <a href={post.imageSourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                      {post.imageCredit}
                    </a>
                  ) : (
                    post.imageCredit
                  )}
                  {post.imageLicense && (
                    <>
                      {" ("}
                      {post.imageLicenseUrl ? (
                        <a
                          href={post.imageLicenseUrl}
                          rel="license noopener noreferrer"
                          target="_blank"
                        >
                          {post.imageLicense}
                        </a>
                      ) : (
                        post.imageLicense
                      )}
                      {")"}
                    </>
                  )}
                </figcaption>
              )}
            </figure>
          )}

          {hasContents && (
            <nav
              className="mt-7 rounded-xl border border-line bg-surface px-5 py-4 xl:hidden"
              aria-label="Contents"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                In this piece
              </p>
              {contentsList}
            </nav>
          )}

          {/* ── The piece. Same renderer as a topic essay: the `:::` directives
                are review-only, and a post has no film to pull a still from. ── */}
          <div className="mt-9">
            <MarkdownProse text={post.content} />
          </div>

          <footer className="mt-12 space-y-9">
            <ReelDivider />

            {/* ── Who and what this is about ── */}
            {(people.length > 0 || films.length > 0) && (
              <section>
                <SectionHead>In this piece</SectionHead>
                {people.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-3">
                    {people.map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={`/people/${p.slug}`}
                          className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-3 pr-4 transition-colors hover:border-accent-dim"
                        >
                          <PersonPortrait person={p} size={40} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold transition-colors group-hover:text-accent">
                              {p.name}
                            </span>
                            {p.occupations.length > 0 && (
                              <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                                {p.occupations[0]}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {films.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-3">
                    {films.map((f) => {
                      const year = f.releaseDate ? new Date(f.releaseDate).getUTCFullYear() : null;
                      return (
                        <li key={f.slug}>
                          <Link
                            href={`/movies/${f.slug}`}
                            className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-3 pr-4 transition-colors hover:border-accent-dim"
                          >
                            <Poster
                              path={f.posterPath}
                              image={f.image}
                              title={f.title}
                              year={year}
                              size="thumb"
                              className="aspect-2/3 w-9 shrink-0 rounded border border-line object-cover"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold transition-colors group-hover:text-accent">
                                {f.title}
                              </span>
                              <span className="block font-mono text-[10px] text-muted tabular-nums">
                                {year ?? "—"}
                                {f.director ? ` · ${f.director}` : ""}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            {/* ── Sources ──
                The other half of `Post_claims_are_sourced`. The database will not
                let a PEOPLE or ISSUE post publish without at least one of these,
                and a citation the schema demands while the page hides it is a lie
                told to the schema. `nofollow` because a source is evidence, not
                an endorsement we are passing rank to. */}
            {post.sources.length > 0 && (
              <section>
                <SectionHead>Sources</SectionHead>
                <ol className="mt-3 space-y-2 text-sm">
                  {post.sources.map((src, i) => (
                    <li key={src} className="flex gap-2.5">
                      <span className="font-mono text-[11px] tabular-nums text-muted">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <a
                        href={src}
                        rel="nofollow noopener noreferrer"
                        target="_blank"
                        className="min-w-0 break-words text-muted underline decoration-line transition-colors hover:text-foreground"
                      >
                        {sourceHost(src)}
                        <span className="text-muted/60"> · {src}</span>
                      </a>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  Every factual claim above is drawn from these. The reading of them is ours.
                </p>
              </section>
            )}

            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {post.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] text-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="font-mono text-xs text-muted">{minutes} min read</p>
              <ShareRow url={url} title={post.title} />
            </div>

            <section className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start gap-4">
                <Avatar src={post.author.avatarUrl} name={author} size={44} />
                <div className="min-w-0">
                  <p className="font-semibold">{author}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {post.author.bio ?? "Writing for CinePixo."}
                  </p>
                </div>
              </div>
            </section>

            {/* Two more queries' worth of navigation, streamed in after the
                piece rather than in front of it. Nobody arriving from a search
                result should wait on "what else is on this shelf" before the
                first paragraph exists. */}
            <Suspense fallback={<RelatedFallback />}>
              <Related postId={post.id} category={post.category} peopleSlugs={people.map((p) => p.slug)} leadName={people[0]?.name} />
            </Suspense>
          </footer>
        </article>

        {hasContents && (
          <aside className="hidden xl:block" aria-label="Article tools">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-8 overflow-y-auto">
              <nav className="border-l border-line pl-4" aria-label="Contents">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  In this piece
                </p>
                {contentsList}
              </nav>
              {/* Under the contents, never inside the article column — the reader
                  reaches the writing before anything sold. */}
              <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_RAIL ?? ""} height={600} />
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
