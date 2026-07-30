import { z } from "zod";

// ── Optional free text ───────────────────────────────────────────

/**
 * An optional prose field. A form submits `""` for anything the user left
 * blank, every one of these columns is nullable, and every consumer treats
 * "not set" as null — so `""` is normalised away here, once.
 *
 * This replaces `.optional().or(z.literal("").transform(() => undefined))`,
 * whose right-hand side was unreachable: `.or()` only evaluates it when the
 * left side *fails*, and `z.string().trim().max(n).optional()` accepts `""`
 * happily. So the empty string reached the database, where `verdict ?? excerpt`
 * stopped falling back (`??` passes `""` through, unlike a missing value) and
 * JSON-LD emitted `image: ""` for a critic with no avatar.
 *
 * A whitespace-only value trims to `""` and is normalised too.
 */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();
}

// ── Users & auth ─────────────────────────────────────────────────

export const userRoleSchema = z.enum(["ADMIN", "MEMBER"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_]+$/, "Username may contain lowercase letters, numbers and underscores only");

// Minimum 12 chars — length beats complexity rules (NIST 800-63B)
export const passwordSchema = z.string().min(12).max(128);

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.email().max(254),
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(50).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// ── Reviews ──────────────────────────────────────────────────────

export const reviewStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

// URL-safe slugs only — blocks path traversal / injection vectors
export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may contain lowercase letters, numbers and hyphens only");

// 0–10 in half-point steps
export const ratingSchema = z.number().min(0).max(10).multipleOf(0.5);

export const spoilerLevelSchema = z.enum(["NONE", "MILD", "FULL"]);
export type SpoilerLevel = z.infer<typeof spoilerLevelSchema>;

export const SPOILER_LABELS: Record<SpoilerLevel, string> = {
  NONE: "Spoiler-free",
  MILD: "Minor spoilers",
  FULL: "Full spoilers",
};

export const reviewInputSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  excerpt: optionalText(500),
  // conclusion-first one-liner, shown above the body
  verdict: optionalText(300),
  content: z.string().min(1).max(100_000),
  rating: ratingSchema,
  status: reviewStatusSchema,
  spoilers: spoilerLevelSchema.default("NONE"),
  movieId: z.string().min(1).max(64),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

// ── Reading helpers ──────────────────────────────────────────────

// Words per minute for prose; deliberately conservative for criticism.
const WPM = 220;

export function readingMinutes(markdown: string): number {
  const words = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\[\]()!|:-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  // CJK has no spaces — count characters and treat ~500/min
  const cjk = (markdown.match(/[ㄱ-힝一-鿿぀-ヿ]/g) ?? []).length;
  const minutes = words / WPM + cjk / 500;
  return Math.max(1, Math.round(minutes));
}

export function countWords(markdown: string): number {
  const latin = markdown.trim().split(/\s+/).filter(Boolean).length;
  const cjk = (markdown.match(/[ㄱ-힝一-鿿぀-ヿ]/g) ?? []).length;
  return cjk > latin ? cjk : latin;
}

// Section headings (## / ###) for the table of contents. Slugs match the ids
// the renderer assigns, so anchors line up.
export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export function extractHeadings(markdown: string): { level: 2 | 3; text: string; id: string }[] {
  const out: { level: 2 | 3; text: string; id: string }[] = [];
  const seen = new Map<string, number>();
  // ignore headings inside fenced code
  const body = markdown.replace(/```[\s\S]*?```/g, "");
  for (const line of body.split("\n")) {
    const m = /^(##|###)\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/[*_`]/g, "").trim();
    let id = headingSlug(text) || "section";
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n > 0) id = `${id}-${n + 1}`;
    out.push({ level: m[1] === "##" ? 2 : 3, text, id });
  }
  return out;
}

// ── Critics ──────────────────────────────────────────────────────

const httpUrl = z
  .url()
  .max(500)
  // http/https only — blocks javascript: and other dangerous schemes
  .refine((u) => /^https?:\/\//.test(u), "Only http/https URLs are allowed");

export const criticLinkSchema = z.object({
  label: z.string().trim().min(1).max(50),
  url: httpUrl,
});

/** Same normalisation as `optionalText`, for a field that must be a real URL. */
const optionalHttpUrl = z
  .union([z.literal(""), httpUrl])
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const criticInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(100),
  bio: optionalText(2000),
  avatarUrl: optionalHttpUrl,
  links: z.array(criticLinkSchema).max(10).default([]),
});
export type CriticInput = z.infer<typeof criticInputSchema>;

// ── Movies ───────────────────────────────────────────────────────

/**
 * The URL slug for a film: `parasite-2019`.
 *
 * Title plus release year, because titles collide constantly (three Suspirias,
 * two Dunes) and the year is how people disambiguate them in speech. Uniqueness
 * is still enforced by the database — callers append `-2`, `-3`… on conflict
 * (see the import route). A title that romanises to nothing (an all-CJK title
 * with no Latin release name) falls back to "film" plus the year rather than
 * an empty slug.
 */
export function movieSlug(title: string, releaseDate?: Date | string | null): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // combining accents: Amélie → amelie
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/[\s-]+/g, "-")
      .slice(0, 100)
      .replace(/-+$/, "") || "film";
  const year = releaseDate ? new Date(releaseDate).getUTCFullYear() : null;
  return year ? `${base}-${year}` : base;
}

export const movieInputSchema = z.object({
  tmdbId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200),
  originalTitle: z.string().trim().max(200).optional(),
  overview: z.string().trim().max(5000).optional(),
  posterPath: z.string().max(300).optional(),
  backdropPath: z.string().max(300).optional(),
  releaseDate: z.iso.date().optional(),
  runtime: z.number().int().min(0).max(1000).optional(),
  director: z.string().trim().max(100).optional(),
  genres: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});
export type MovieInput = z.infer<typeof movieInputSchema>;

// ── Pagination ───────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export type Pagination = z.infer<typeof paginationSchema>;

// ── Display helpers ──────────────────────────────────────────────

// 0–10 rating → 5-star scale (e.g. 9.5 → 4.75)
export function toStarScale(rating: number): number {
  return Math.round((rating / 2) * 100) / 100;
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
