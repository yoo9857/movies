import { POST_CATEGORY_LABELS, type PostCategory } from "@cinepixo/shared";
import Image from "next/image";
import Link from "next/link";

export interface PostRowData {
  slug: string;
  title: string;
  dek: string | null;
  category: PostCategory;
  publishedAt: Date | null;
  image: string | null;
  imageAlt: string | null;
  author: { username: string; displayName: string | null };
}

/**
 * One post in a list — the shape every blog index uses.
 *
 * The standfirst gets the width, not the thumbnail. A post's headline is
 * frequently a name plus a claim ("Song Kang-ho on the year he stopped saying
 * yes"), which reads as a fragment without the sentence under it; the picture is
 * the least load-bearing thing in the row and is the first thing dropped.
 *
 * The date is printed on every row because for this kind of writing "when" is
 * part of the claim — a piece about what someone is doing now is a piece about a
 * moment, and a reader deciding whether to click deserves to know which one.
 */
export function PostRow({ post }: { post: PostRowData }) {
  const author = post.author.displayName ?? post.author.username;
  const date = post.publishedAt ? new Date(post.publishedAt) : null;

  return (
    <article>
      <Link
        href={`/blog/${post.slug}`}
        className="group flex gap-4 py-5 transition-colors hover:bg-surface/40"
      >
        {post.image && (
          <Image
            src={post.image}
            // Decorative here: the headline beside it carries the same
            // information, and a screen reader does not need it twice. The real
            // alt text is on the post page, where the picture stands alone.
            alt=""
            width={160}
            height={107}
            sizes="160px"
            className="hidden h-[4.6rem] w-28 shrink-0 rounded-lg border border-line object-cover sm:block"
          />
        )}
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
            {POST_CATEGORY_LABELS[post.category]}
          </span>
          <h3 className="mt-1 text-balance text-lg font-semibold leading-snug transition-colors group-hover:text-accent">
            {post.title}
          </h3>
          {post.dek && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{post.dek}</p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted">
            <span>{author}</span>
            {date && (
              <>
                <span aria-hidden="true">·</span>
                <time dateTime={date.toISOString()}>
                  {date.toLocaleDateString("en-US", { dateStyle: "medium" })}
                </time>
              </>
            )}
          </p>
        </div>
      </Link>
    </article>
  );
}
