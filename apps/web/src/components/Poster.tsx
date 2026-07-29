import Image from "next/image";

/**
 * A film poster at an honest resolution.
 *
 * TMDB serves fixed variants, and Next.js optimises whatever we point it at, so
 * asking for w342 to fill a 28px avatar slot wastes the fetch twice over. The
 * caller states how wide the poster will actually render and gets the smallest
 * variant that covers it on a 2× screen.
 */
const VARIANTS = {
  /** thumbnails, list rows, author cards — up to ~92px wide */
  thumb: { file: "w185", w: 185, h: 278 },
  /** grid cards and rails — up to ~170px wide */
  card: { file: "w342", w: 342, h: 513 },
  /** the large poster on a detail page */
  hero: { file: "w500", w: 500, h: 750 },
} as const;

export function Poster({
  path,
  title,
  className = "",
  size = "card",
  sizes,
  priority = false,
}: {
  path: string | null;
  title: string;
  className?: string;
  size?: keyof typeof VARIANTS;
  /** CSS `sizes`; without it the browser assumes the full viewport width */
  sizes?: string;
  priority?: boolean;
}) {
  if (!path || !path.startsWith("/")) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-raised text-center text-xs text-muted ${className}`}
        aria-label={`No poster for ${title}`}
      >
        No poster
      </div>
    );
  }

  const v = VARIANTS[size];
  return (
    <Image
      src={`https://image.tmdb.org/t/p/${v.file}${path}`}
      alt={`${title} poster`}
      width={v.w}
      height={v.h}
      sizes={sizes ?? `${v.w}px`}
      priority={priority}
      className={`object-cover ${className}`}
    />
  );
}
