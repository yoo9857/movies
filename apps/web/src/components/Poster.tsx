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
 * So an absent poster is drawn in the house style instead: ink ground, the
 * film-strip edge and reel dots from the mark, the title set as type, the year
 * and director underneath. Composition and colour do the identifying — the same
 * argument as the share cards, and the only artwork on the site that is entirely
 * ours.
 *
 * The colour is the film's, not the site's: the genre picks the mood — dried
 * red for horror, nitrate silver for the noir shelf, signal blue for science
 * fiction — so a grid of house cards reads as a shelf of different films rather
 * than one repeated tile. Deterministic (same film, same card, every render),
 * with the projector gold as the default any film can wear. Films with no genre
 * fall back by era: the pre-1950 shelf is silver, like its prints.
 *
 * Rendered inline rather than fetched. A route per poster would mean one request
 * (and one rasterisation) per thumbnail on a grid of twenty-four films; this is
 * markup the page already had to send.
 */

interface Mood {
  accent: string;
  /** A faint projector-beam wash in the accent, top-right, behind the type. */
  wash: string;
}

const GOLD_MOOD: Mood = { accent: "#e8b34b", wash: "rgba(232, 179, 75, 0.09)" };

const MOODS: Record<string, Mood> = {
  horror: { accent: "#b04a4a", wash: "rgba(176, 74, 74, 0.12)" },
  noir: { accent: "#a7b0ba", wash: "rgba(167, 176, 186, 0.09)" },
  scifi: { accent: "#5b93e6", wash: "rgba(91, 147, 230, 0.10)" },
  romance: { accent: "#c96f6f", wash: "rgba(201, 111, 111, 0.10)" },
  earth: { accent: "#b3873a", wash: "rgba(179, 135, 58, 0.08)" },
  gold: GOLD_MOOD,
};

/** First genre that says something wins — the canonical genre list is small. */
const GENRE_MOOD: Record<string, keyof typeof MOODS> = {
  Horror: "horror",
  Thriller: "horror",
  Crime: "noir",
  Mystery: "noir",
  "Science Fiction": "scifi",
  Fantasy: "scifi",
  Romance: "romance",
  Music: "romance",
  History: "earth",
  War: "earth",
  Western: "earth",
  Documentary: "earth",
};

function moodFor(genres: string[] | undefined, year: number | null | undefined): Mood {
  for (const g of genres ?? []) {
    const key = GENRE_MOOD[g];
    if (key) return MOODS[key];
  }
  // No genre that picks a mood: the silent-and-studio era wears silver.
  if (year != null && year < 1950) return MOODS.noir;
  return GOLD_MOOD;
}

function HousePoster({
  title,
  year,
  director,
  genres,
  className,
}: {
  title: string;
  year?: number | null;
  director?: string | null;
  genres?: string[];
  className: string;
}) {
  // Long titles step down rather than overflow; at thumbnail size the type is
  // decorative anyway, and `line-clamp` keeps the block from pushing the layout.
  const scale = title.length > 44 ? "text-[7cqw]" : title.length > 22 ? "text-[9cqw]" : "text-[12cqw]";
  const mood = moodFor(genres, year);

  return (
    <div
      className={`@container relative flex flex-col justify-between overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(120% 90% at 78% 8%, ${mood.wash}, transparent 55%), #0b0b0f`,
      }}
      role="img"
      aria-label={`${title}${year ? ` (${year})` : ""} — no poster; CinePixo house card`}
    >
      {/* the film-strip edge, as on the share cards */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2.5cqw]"
        style={{ backgroundColor: mood.accent }}
      />
      <span aria-hidden className="absolute right-[6cqw] top-[6cqw] flex gap-[2cqw]">
        {[1, 0.6, 0.3].map((o, i) => (
          <span
            key={i}
            className="block size-[2.5cqw] rounded-full"
            style={{ opacity: o, backgroundColor: mood.accent }}
          />
        ))}
      </span>
      <p
        className={`mt-auto px-[9cqw] pt-[16cqw] font-bold leading-[1.1] tracking-tight text-foreground ${scale} line-clamp-5`}
      >
        {title}
      </p>
      <p className="px-[9cqw] pb-[8cqw] pt-[4cqw] font-mono text-[6cqw] leading-snug text-muted">
        <span style={{ color: mood.accent }}>{year ?? "—"}</span>
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
  genres,
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
  /** Also for the house card: the genre picks the card's mood colour. */
  genres?: string[];
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
    return (
      <HousePoster
        title={title}
        year={year}
        director={director}
        genres={genres}
        className={className}
      />
    );
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
