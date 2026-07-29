// Server-renderable star rating: converts a 0–10 score to a 5-star display.
import { toStarScale } from "@cinepixo/shared";

function Star({ fill }: { fill: number }) {
  const id = `star-${Math.round(fill * 100)}`;
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="var(--accent)" />
          <stop offset={`${fill * 100}%`} stopColor="var(--border)" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z"
      />
    </svg>
  );
}

export function StarRating({ rating, showNumber = true }: { rating: number; showNumber?: boolean }) {
  const stars = toStarScale(rating); // 0–5
  return (
    <span
      className="inline-flex items-center gap-1"
      role="img"
      aria-label={`Rated ${stars} out of 5 stars`}
    >
      <span className="inline-flex gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} fill={Math.max(0, Math.min(1, stars - i))} />
        ))}
      </span>
      {showNumber && (
        <span className="ml-1 text-sm font-semibold text-accent tabular-nums">
          {stars.toFixed(1)}
        </span>
      )}
    </span>
  );
}
