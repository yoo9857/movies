import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReactElement } from "react";
import { monogram } from "./monogram";

/**
 * The site's face in every place a link is shared.
 *
 * One static opengraph-image.png used to answer for the whole site, so a review
 * shared to a group chat looked exactly like the homepage — no title, no score,
 * nothing of the piece in it. The share preview is where most people meet the
 * site for the first time, and it was the one surface with nothing of ours on
 * it.
 *
 * Everything here is drawn from the house: projector gold on ink, Geist, the
 * reel dots from the mark, the score set as a number rather than an image. The
 * film's poster appears as a plate on the right where we have one — it belongs
 * to the film and it is the fastest recognition signal a card can carry — but
 * the composition, the type and the numbers are ours, so the card reads as
 * CinePixo before it reads as the film.
 *
 * Satori (behind ImageResponse) supports a deliberate subset of CSS: flex only,
 * no grid, no cascade. Styles are therefore inline and explicit, and every
 * layout is a flex box by construction rather than by preference.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const INK = "#0b0b0f";
const SURFACE = "#14141b";
const FOREGROUND = "#ecebe8";
const MUTED = "#9b99a3";
const GOLD = "#e8b34b";

/**
 * Geist, read off disk at render time.
 *
 * `next/font` caches into `.next` in a shape that is not a stable file path, so
 * the renderer reads real files instead — and they are vendored into
 * `apps/web/assets/fonts` rather than resolved from `node_modules`. That is not
 * tidiness: npm workspaces hoist dependencies to the *repo root*, while
 * `process.cwd()` under pm2 is `apps/web`, so a node_modules path that resolves
 * on a dev machine can be absent in production. A brand font is also an asset
 * we should own outright; the OFL licence ships beside it.
 *
 * Cached per process — ~130KB each, and the files do not change while the
 * server is up.
 */
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

let fontCache: { regular: Buffer; bold: Buffer } | null = null;

async function fonts(): Promise<{ regular: Buffer; bold: Buffer }> {
  if (fontCache) return fontCache;
  const [regular, bold] = await Promise.all([
    readFile(path.join(FONT_DIR, "Geist-Regular.ttf")),
    readFile(path.join(FONT_DIR, "Geist-Bold.ttf")),
  ]);
  fontCache = { regular, bold };
  return fontCache;
}

/**
 * One of our own images, re-encoded for the card renderer.
 *
 * Satori cannot decode WebP, and WebP is what our whole upload pipeline
 * produces — so a portrait we own rendered as an empty circle while a TMDB
 * poster (JPEG) rendered fine. Rather than store a second format forever, the
 * bytes are converted to PNG here and embedded as a data URI: one format on
 * disk, adapted only for the one renderer that cannot read it.
 *
 * Downscaled first because the card never shows a portrait above ~210px and a
 * base64 payload of a 640px original is wasted bytes in every render.
 *
 * Returns null on any failure — a card without a face is fine, a card that
 * throws is not.
 */
export async function ourImageAsPng(
  url: string,
  size: number,
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const sharp = (await import("sharp")).default;
    const png = await sharp(input)
      .resize(size, size, { fit: "cover", position: "top" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Options for `ImageResponse`, with the family registered under one name. */
export async function ogFontOptions() {
  const { regular, bold } = await fonts();
  return {
    ...OG_SIZE,
    fonts: [
      { name: "Geist", data: regular as unknown as ArrayBuffer, weight: 400 as const, style: "normal" as const },
      { name: "Geist", data: bold as unknown as ArrayBuffer, weight: 700 as const, style: "normal" as const },
    ],
  };
}

/** The three dots from the logo, as a row. */
function ReelDots() {
  return (
    <div style={{ display: "flex", gap: 7 }}>
      {[1, 0.6, 0.3].map((opacity, i) => (
        <div
          key={i}
          style={{
            width: 11,
            height: 11,
            borderRadius: 999,
            background: GOLD,
            opacity,
          }}
        />
      ))}
    </div>
  );
}

/** Wordmark plus the line that says what the site is. */
function Footer({ note }: { note?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <ReelDots />
      <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>
        <span style={{ color: FOREGROUND }}>Cine</span>
        <span style={{ color: GOLD }}>Pixo</span>
      </div>
      {note && (
        <span style={{ fontSize: 20, color: MUTED, marginLeft: 4 }}>{note}</span>
      )}
    </div>
  );
}

/** A rating, set as type. 0–10 in halves is the real scale. */
function Score({ value }: { value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: 78, fontWeight: 700, color: GOLD, lineHeight: 1 }}>
        {value.toFixed(1)}
      </span>
      <span style={{ fontSize: 26, color: MUTED }}>/10</span>
    </div>
  );
}

/**
 * A star, drawn rather than typed.
 *
 * "★" (U+2605) is not in Geist, and satori has no fallback chain to borrow it
 * from — it rendered as a tofu box in the first cards off the press. Drawing the
 * glyph keeps the mark on-brand and independent of what any font happens to
 * cover.
 */
function Star({ size, color = GOLD }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.4l2.95 5.98 6.6.96-4.775 4.655 1.127 6.57L12 17.47l-5.902 3.095 1.127-6.57L2.45 9.34l6.6-.96z" />
    </svg>
  );
}

/** Small uppercase label — the site's section-head voice. */
function Eyebrow({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 20,
        letterSpacing: 4,
        textTransform: "uppercase",
        color: MUTED,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The frame every card shares: ink field, a gold hairline down the left edge as
 * a film-strip reference, and generous margins so the type is never crowded.
 */
function Card({
  children,
  poster,
}: {
  children: ReactElement | ReactElement[];
  /** Absolute image URL for the right-hand plate, when there is one. */
  poster?: string | null;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: INK,
        color: FOREGROUND,
        fontFamily: "Geist",
      }}
    >
      {/* Film-strip edge */}
      <div style={{ display: "flex", width: 10, background: GOLD }} />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 60px",
        }}
      >
        {children}
      </div>

      {poster && (
        <div style={{ display: "flex", padding: "56px 60px 56px 0", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori renders to a raster; next/image has no role here */}
          <img
            src={poster}
            alt=""
            width={330}
            height={495}
            style={{
              width: 330,
              height: 495,
              objectFit: "cover",
              borderRadius: 18,
              border: `1px solid ${SURFACE}`,
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Clamp for a headline, so a long title degrades rather than overflowing.
 *
 * Three periods, not "…": every glyph on these cards has to exist in Geist,
 * because satori has no font-fallback chain to borrow a missing one from — it
 * draws a tofu box instead. That is not theoretical; it is how the first batch
 * of cards shipped a box where the star should have been.
 */
function clampText(text: string, max: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 3).trimEnd()}...`;
}

/* ── The three cards ─────────────────────────────────────────── */

export function ReviewCard(input: {
  title: string;
  verdict?: string | null;
  rating: number;
  author: string;
  film: string;
  year?: number | null;
  poster?: string | null;
}): ReactElement {
  const hasPoster = Boolean(input.poster);
  return (
    <Card poster={input.poster}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Eyebrow>Review</Eyebrow>
        <div
          style={{
            display: "flex",
            fontSize: hasPoster ? 56 : 68,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            maxWidth: hasPoster ? 620 : 1000,
          }}
        >
          {clampText(input.title, hasPoster ? 70 : 90)}
        </div>
        {input.verdict && (
          <div
            style={{
              display: "flex",
              fontSize: 27,
              lineHeight: 1.35,
              color: MUTED,
              maxWidth: hasPoster ? 620 : 940,
            }}
          >
            {clampText(input.verdict, hasPoster ? 120 : 180)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 28 }}>
          <Score value={input.rating} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 6 }}>
            <span style={{ fontSize: 25, fontWeight: 700, color: FOREGROUND }}>
              {clampText(input.film, 42)}
              {input.year ? ` (${input.year})` : ""}
            </span>
            <span style={{ fontSize: 21, color: MUTED }}>by {clampText(input.author, 34)}</span>
          </div>
        </div>
        <Footer />
      </div>
    </Card>
  );
}

export function MovieCard(input: {
  title: string;
  year?: number | null;
  director?: string | null;
  fandomStars?: number | null;
  reviewCount: number;
  poster?: string | null;
}): ReactElement {
  return (
    <Card poster={input.poster}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Eyebrow>Film</Eyebrow>
        <div
          style={{
            display: "flex",
            fontSize: 66,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: -1.8,
            maxWidth: 620,
          }}
        >
          {clampText(input.title, 60)}
        </div>
        <div style={{ display: "flex", fontSize: 26, color: MUTED, gap: 14 }}>
          {input.year && <span>{input.year}</span>}
          {input.director && <span>· {clampText(input.director, 30)}</span>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        {/* Only ever the fandom's own number. No reviews here means an
            invitation, not a borrowed score from somewhere else. */}
        {input.fandomStars != null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Star size={56} />
            <span style={{ fontSize: 70, fontWeight: 700, color: GOLD, lineHeight: 1 }}>
              {input.fandomStars.toFixed(1)}
            </span>
            <span style={{ fontSize: 24, color: MUTED, paddingTop: 14 }}>
              from {input.reviewCount} review{input.reviewCount === 1 ? "" : "s"}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 32, color: GOLD }}>
            No reviews yet — write the first
          </div>
        )}
        <Footer />
      </div>
    </Card>
  );
}

/**
 * The site itself, for the home page and every listing under it.
 *
 * The static `app/opengraph-image.png` does not reach pages inside the `(site)`
 * route group, so those pages shared with no image at all. This card replaces
 * that silence with the wordmark and the only numbers that matter here — how
 * much has actually been written.
 */
export function SiteCard(input: {
  tagline: string;
  reviews: number;
  films: number;
  people: number;
}): ReactElement {
  const stat = (value: number, label: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }} key={label}>
      <span style={{ fontSize: 56, fontWeight: 700, color: GOLD, lineHeight: 1 }}>
        {value.toLocaleString("en-US")}
      </span>
      <span style={{ fontSize: 21, color: MUTED, letterSpacing: 2, textTransform: "uppercase" }}>
        {label}
      </span>
    </div>
  );

  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <ReelDots />
        <div style={{ display: "flex", fontSize: 104, fontWeight: 700, letterSpacing: -3.5 }}>
          <span style={{ color: FOREGROUND }}>Cine</span>
          <span style={{ color: GOLD }}>Pixo</span>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: MUTED, maxWidth: 900, lineHeight: 1.3 }}>
          {clampText(input.tagline, 120)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 72 }}>
        {stat(input.reviews, "reviews")}
        {stat(input.films, "films")}
        {stat(input.people, "people")}
      </div>
    </Card>
  );
}

/**
 * A topic or motif: the term set large, its definition, and the posters of the
 * films behind it — the card version of the page's claim-plus-evidence shape.
 */
export function TopicCard(input: {
  name: string;
  kind: "THEME" | "MOTIF";
  description?: string | null;
  filmCount: number;
  /** Absolute poster URLs, at most three render. */
  posters: string[];
}): ReactElement {
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Eyebrow>{input.kind === "THEME" ? "Theme" : "Motif"}</Eyebrow>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 1000,
          }}
        >
          {clampText(input.name, 44)}
        </div>
        {input.description && (
          <div style={{ display: "flex", fontSize: 28, lineHeight: 1.35, color: MUTED, maxWidth: 960 }}>
            {clampText(input.description, 150)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ display: "flex", gap: 12 }}>
            {input.posters.slice(0, 3).map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- satori raster
              <img
                key={i}
                src={src}
                alt=""
                width={92}
                height={138}
                style={{
                  width: 92,
                  height: 138,
                  objectFit: "cover",
                  borderRadius: 10,
                  border: `1px solid ${SURFACE}`,
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 26, color: MUTED }}>
            {input.filmCount} film{input.filmCount === 1 ? "" : "s"} in the library
          </span>
        </div>
        <Footer note="themes & motifs, argued film by film" />
      </div>
    </Card>
  );
}

/**
 * A blog post: the shelf it sits on, the headline, the standfirst, and the
 * byline with the date.
 *
 * No score anywhere, deliberately — a post has no rating, and a card that put a
 * number on one would be advertising a review. The date is on the card because
 * this is the one kind of writing here where "when" is part of the claim: a
 * piece about what an actor is doing is a piece about a moment.
 */
export function PostCard(input: {
  title: string;
  dek?: string | null;
  /** The shelf label as the site prints it — "Away From Set", not "PEOPLE". */
  section: string;
  author: string;
  /** Already formatted for display; this file does no locale work. */
  date?: string | null;
  /** Absolute URL of the hero, as a PNG satori can decode. */
  hero?: string | null;
}): ReactElement {
  const hasHero = Boolean(input.hero);
  return (
    <Card poster={input.hero}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Eyebrow>{input.section}</Eyebrow>
        <div
          style={{
            display: "flex",
            fontSize: hasHero ? 54 : 66,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            maxWidth: hasHero ? 620 : 1000,
          }}
        >
          {clampText(input.title, hasHero ? 72 : 92)}
        </div>
        {input.dek && (
          <div
            style={{
              display: "flex",
              fontSize: 27,
              lineHeight: 1.35,
              color: MUTED,
              maxWidth: hasHero ? 620 : 940,
            }}
          >
            {clampText(input.dek, hasHero ? 130 : 190)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 25 }}>
          <span style={{ color: FOREGROUND }}>{clampText(input.author, 34)}</span>
          {input.date && (
            <>
              <span style={{ color: MUTED }}>·</span>
              <span style={{ color: MUTED }}>{input.date}</span>
            </>
          )}
        </div>
        <Footer note={hasHero ? undefined : "film writing that isn't a review"} />
      </div>
    </Card>
  );
}

export function PersonCard(input: {
  name: string;
  role?: string | null;
  filmCount: number;
  reviewCount: number;
  fandomStars?: number | null;
  portrait?: string | null;
}): ReactElement {
  // Computed here, not inline in JSX: satori dropped the chained
  // split/map/join expression and drew an empty circle. A plain string child is
  // the shape it reliably renders.
  const initials = monogram(input.name);

  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Eyebrow>{input.role ?? "In the library"}</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          {input.portrait ? (
            // eslint-disable-next-line @next/next/no-img-element -- satori raster
            <img
              src={input.portrait}
              alt=""
              width={210}
              height={210}
              style={{
                width: 210,
                height: 210,
                borderRadius: 999,
                objectFit: "cover",
                border: `3px solid ${GOLD}`,
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                width: 210,
                height: 210,
                borderRadius: 999,
                background: SURFACE,
                border: `3px solid ${GOLD}`,
                alignItems: "center",
                justifyContent: "center",
                fontSize: 74,
                fontWeight: 700,
                color: GOLD,
              }}
            >
              {initials}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 700 }}>
            <div
              style={{
                display: "flex",
                fontSize: 62,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1.6,
              }}
            >
              {clampText(input.name, 34)}
            </div>
            <div style={{ display: "flex", alignItems: "center", fontSize: 26, color: MUTED, gap: 10 }}>
              <span>
                {input.filmCount} film{input.filmCount === 1 ? "" : "s"}
              </span>
              {input.fandomStars != null && (
                <>
                  <span>·</span>
                  <Star size={24} />
                  <span style={{ color: GOLD }}>
                    {input.fandomStars.toFixed(1)} across {input.reviewCount} review
                    {input.reviewCount === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer note="the criticism on their work" />
    </Card>
  );
}
