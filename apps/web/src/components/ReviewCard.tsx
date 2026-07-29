import Link from "next/link";
import { Poster } from "./Poster";
import { StarRating } from "./StarRating";

export interface ReviewCardData {
  slug: string;
  title: string;
  excerpt: string | null;
  rating: number;
  publishedAt: Date | string | null;
  author: { username: string; displayName: string | null };
  movie: { title: string; posterPath: string | null; director: string | null };
}

export function ReviewCard({ review }: { review: ReviewCardData }) {
  const date = review.publishedAt ? new Date(review.publishedAt) : null;
  return (
    <Link
      href={`/reviews/${review.slug}`}
      className="group flex gap-4 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent-dim"
    >
      <Poster
        path={review.movie.posterPath}
        title={review.movie.title}
        className="h-36 w-24 shrink-0 rounded-md"
      />
      <div className="flex min-w-0 flex-col">
        <p className="text-xs uppercase tracking-wide text-muted">
          {review.movie.title}
          {review.movie.director ? ` · ${review.movie.director}` : ""}
        </p>
        <h3 className="mt-1 font-semibold leading-snug group-hover:text-accent transition-colors">
          {review.title}
        </h3>
        {review.excerpt && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{review.excerpt}</p>
        )}
        <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-muted">
          <StarRating rating={review.rating} />
          <span>by {review.author.displayName ?? review.author.username}</span>
          {date && <time dateTime={date.toISOString()}>{date.toLocaleDateString("en-US")}</time>}
        </div>
      </div>
    </Link>
  );
}
