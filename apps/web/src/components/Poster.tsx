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

/**
 * The house poster: what a film looks like here when there is no photograph.
 *
 * Most of the library arrives from Wikidata, which has facts and no artwork —
 * film posters are not free to redistribute, so there is nothing honest to fetch.
 * The old fallback was a grey box reading "No poster", repeated across a grid,
 * which read as a broken page rather than a deliberate one.
 *
 * So an absent poster is drawn in the house style instead: ink ground, the gold
 * film-strip edge and reel dots from the mark, the title set as type, the year
 * and director underneath. Composition and colour do the identifying — the same
 * argument as the share cards, and the only artwork on the site that is entirely
 * ours.
 *
 * Rendered inline rather than fetched. A route per poster would mean one request
 * (and one rasterisation) per thumbnail on a grid of twenty-four films; this is
 * markup the page already had to send.
 */
function HousePoster({
  title,
  year,
  director,
  className,
}: {
  title: string;
  year?: number | null;
  director?: string | null;
  className: string;
}) {
  // Long titles step down rather than overflow; at thumbnail size the type is
  // decorative anyway, and `line-clamp` keeps the block from pushing the layout.
  const scale = title.length > 44 ? "text-[7cqw]" : title.length > 22 ? "text-[9cqw]" : "text-[12cqw]";

  return (
    <div
      className={`@container relative flex flex-col justify-between overflow-hidden bg-[#0b0b0f] ${className}`}
      role="img"
      aria-label={`${title}${year ? ` (${year})` : ""} — no poster; CinePixo house card`}
    >
      {/* the film-strip edge, as on the share cards */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[2.5cqw] bg-accent" />
      <span aria-hidden className="absolute right-[6cqw] top-[6cqw] flex gap-[2cqw]">
        {[1, 0.6, 0.3].map((o, i) => (
          <span
            key={i}
            className="block size-[2.5cqw] rounded-full bg-accent"
            style={{ opacity: o }}
          />
        ))}
      </span>
      <p
        className={`mt-auto px-[9cqw] pt-[16cqw] font-bold leading-[1.1] tracking-tight text-foreground ${scale} line-clamp-5`}
      >
        {title}
      </p>
      <p className="px-[9cqw] pb-[8cqw] pt-[4cqw] font-mono text-[6cqw] leading-snug text-muted">
        {year ?? "—"}
        {director ? <span className="block truncate">{director}</span> : null}
      </p>
    </div>
  );
}

export function Poster({
  path,
  image,
  title,
  year,
  director,
  className = "",
  size = "card",
  sizes,
  priority = false,
}: {
  path: string | null;
  /**
   * A real poster or still on our own storage, from a freely licensed Commons
   * file. Preferred over TMDB's path: it is the same picture of the same film,
   * served from our origin at the size we asked for, and it is the only artwork
   * here we can point at a licence for.
   */
  image?: string | null;
  title: string;
  /** For the house card, when there is no poster of any kind to show. */
  year?: number | null;
  director?: string | null;
  className?: string;
  size?: keyof typeof VARIANTS;
  /** CSS `sizes`; without it the browser assumes the full viewport width */
  sizes?: string;
  priority?: boolean;
}) {
  const v = VARIANTS[size];

  if (image) {
    return (
      <Image
        src={image}
        alt={`${title} poster`}
        width={v.w}
        height={v.h}
        sizes={sizes ?? `${v.w}px`}
        priority={priority}
        className={`object-cover ${className}`}
      />
    );
  }

  if (!path || !path.startsWith("/")) {
    return <HousePoster title={title} year={year} director={director} className={className} />;
  }

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
