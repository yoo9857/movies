import { z } from "zod";

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

export const reviewInputSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  content: z.string().min(1).max(100_000),
  rating: ratingSchema,
  status: reviewStatusSchema,
  movieId: z.string().min(1).max(64),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

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

export const criticInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  avatarUrl: httpUrl.optional().or(z.literal("").transform(() => undefined)),
  links: z.array(criticLinkSchema).max(10).default([]),
});
export type CriticInput = z.infer<typeof criticInputSchema>;

// ── Movies ───────────────────────────────────────────────────────

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
