// Credits-roll index — the default vessel for review lists.
// Numbers reflect the active sort order (information, not decoration).
import { toStarScale } from "@cinepixo/shared";
import Link from "next/link";

export interface ReviewIndexEntry {
  slug: string;
  title: string;
  rating: number;
  publishedAt: Date | string | null;
  author: { username: string; displayName: string | null };
  movie?: { title: string; releaseDate?: Date | string | null } | null;
}

export function ReviewIndex({
  reviews,
  startAt = 1,
  showMovie = true,
}: {
  reviews: ReviewIndexEntry[];
  startAt?: number;
  showMovie?: boolean;
}) {
  if (reviews.length === 0) return null;
  return (
    <div className="border-t border-line">
      {reviews.map((r, i) => {
        const date = r.publishedAt ? new Date(r.publishedAt) : null;
        const year =
          r.movie?.releaseDate != null ? new Date(r.movie.releaseDate).getFullYear() : null;
        return (
          <Link key={r.slug} href={`/reviews/${r.slug}`} className="cx-index-row group">
            <span className="font-mono text-lg text-muted tabular-nums">
              {String(startAt + i).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="font-semibold transition-colors group-hover:text-accent">
                {r.title}
              </span>
              <span className="text-sm text-muted">
                {showMovie && r.movie ? ` · ${r.movie.title}${year ? ` (${year})` : ""}` : ""}
                {" · "}
                {r.author.displayName ?? r.author.username}
              </span>
            </span>
            <span className="font-mono text-sm text-accent tabular-nums">
              ★ {toStarScale(r.rating).toFixed(1)}
            </span>
            <span className="hidden font-mono text-xs text-muted sm:inline">
              {date
                ? date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
                : "draft"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
