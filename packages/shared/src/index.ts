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

export const profileInputSchema = z.object({
  displayName: optionalText(50),
  bio: optionalText(600),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

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

// ── People ───────────────────────────────────────────────────────

/** A date we typed, not a timestamp — "1969-09-14", or nothing. */
const optionalDay = z
  .union([z.literal(""), z.iso.date()])
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const personInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  bio: optionalText(2000),
  /** Career notes: collaborators, what to watch first — our editorial voice. */
  notes: optionalText(4000),
  birthPlace: optionalText(160),
  deathPlace: optionalText(160),
  birthDate: optionalDay,
  deathDate: optionalDay,
  links: z.array(criticLinkSchema).max(10).default([]),
});
export type PersonInput = z.infer<typeof personInputSchema>;

// ── Topics ───────────────────────────────────────────────────────

/**
 * The editorial taxonomy: a THEME is what a film is about, a MOTIF is what
 * recurs on screen. Two kinds only, on purpose — an axis that doesn't fit
 * either is usually two axes that haven't been separated yet.
 */
export const topicKindSchema = z.enum(["THEME", "MOTIF"]);
export type TopicKind = z.infer<typeof topicKindSchema>;

export const TOPIC_KIND_LABELS: Record<TopicKind, string> = {
  THEME: "Theme",
  MOTIF: "Motif",
};

export const topicInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(80),
  kind: topicKindSchema,
  /** One-sentence definition, shown on cards and list pages. */
  description: optionalText(300),
  /** The editorial essay (markdown) — why the axis matters, what to watch. */
  essay: optionalText(10_000),
});
export type TopicInput = z.infer<typeof topicInputSchema>;

/** Replaces a topic's film list wholesale — assignment is curation, not append. */
export const topicFilmsSchema = z.object({
  films: z
    .array(
      z.object({
        movieId: z.string().min(1).max(64),
        /** Why this film carries the topic — one sentence, ours. */
        note: optionalText(500),
      }),
    )
    .max(200)
    .default([]),
});
export type TopicFilmsInput = z.infer<typeof topicFilmsSchema>;

// ── Blog posts ───────────────────────────────────────────────────

/**
 * What kind of piece a post is.
 *
 * These are not the Topic axes. A THEME says what a *film* is about; these say
 * what an *article* is, and the split earns its keep in one place: PEOPLE and
 * ISSUE pieces make factual claims about living people, so those two require a
 * source before they can be published. CRAFT and WATCHLIST are our own reading
 * of films we have watched and require none.
 */
export const postCategorySchema = z.enum([
  "PEOPLE",
  "ISSUE",
  "INDUSTRY",
  "CRAFT",
  "WATCHLIST",
]);
export type PostCategory = z.infer<typeof postCategorySchema>;

/** What the article does for its reader, independent of its subject shelf. */
export const postFormatSchema = z.enum([
  "EDITORIAL_FEATURE",
  "REPORTED_ANALYSIS",
  "PROBLEM_SOLVING",
  "COMPARISON",
  "ROUNDUP",
  "CHECKLIST",
  "FIRST_HAND_GUIDE",
]);
export type PostFormat = z.infer<typeof postFormatSchema>;

export const POST_FORMAT_LABELS: Record<PostFormat, string> = {
  EDITORIAL_FEATURE: "Editorial feature",
  REPORTED_ANALYSIS: "Reported analysis",
  PROBLEM_SOLVING: "Problem-solving guide",
  COMPARISON: "Comparison",
  ROUNDUP: "Roundup",
  CHECKLIST: "Checklist",
  FIRST_HAND_GUIDE: "First-hand guide",
};

export const POST_FORMAT_BLURBS: Record<PostFormat, string> = {
  EDITORIAL_FEATURE:
    "A CinePixo feature whose more specific reporting or utility method has not been claimed.",
  REPORTED_ANALYSIS:
    "A sourced event or argument, reported clearly and interpreted by the desk.",
  PROBLEM_SOLVING:
    "Starts with a real reader problem and leaves them with a usable answer or sequence of steps.",
  COMPARISON:
    "Compares the same decision on consistent criteria, states trade-offs and names who each option suits.",
  ROUNDUP:
    "Organises a finite set, explains the inclusion rule and gives every item a reason to be here.",
  CHECKLIST:
    "A scannable set of checks a reader can complete before booking, buying, watching or publishing.",
  FIRST_HAND_GUIDE:
    "Built from something the writer actually watched, visited, tested or compared, with the method disclosed.",
};

/** Published utility formats need sources or a visible account of our own test. */
export const EVIDENCE_FORMATS: readonly PostFormat[] = [
  "PROBLEM_SOLVING",
  "COMPARISON",
  "ROUNDUP",
  "CHECKLIST",
];

/**
 * The shelf label, as it reads in navigation and on a card.
 *
 * `PEOPLE` is **not** "Off Camera": that is the blog's own name, and using it
 * twice gave `/blog` and `/blog/category/people` the same heading — two
 * indexable pages claiming to be the same thing, and a reader with no way to
 * tell which one they were on.
 */
export const POST_CATEGORY_LABELS: Record<PostCategory, string> = {
  PEOPLE: "Away From Set",
  ISSUE: "The Argument",
  INDUSTRY: "Industry",
  CRAFT: "Craft",
  WATCHLIST: "Watchlist",
};

/** One line saying what the shelf is for — rendered on /blog and its shelves. */
export const POST_CATEGORY_BLURBS: Record<PostCategory, string> = {
  PEOPLE:
    "The people who make films, away from the film: what they are working on, what they have said, where they have gone.",
  ISSUE:
    "An argument the film world is having, explained — what happened, who is on which side, and what actually turns on it.",
  INDUSTRY:
    "The business of pictures: what got made, what it cost, what it took, and which festival said so.",
  CRAFT:
    "How films are made — the camera, the cut, the score, the design — read closely on the films that show it best.",
  WATCHLIST: "What to watch, in what order, and why that order.",
};

/** The URL segment for a shelf: PEOPLE → /blog/people. */
export const postCategorySlug = (c: PostCategory) => c.toLowerCase();

/** The reverse, for a route param. Anything unrecognised is not a shelf. */
export function postCategoryFromSlug(raw: string): PostCategory | null {
  const found = postCategorySchema.options.find((c) => c.toLowerCase() === raw);
  return found ?? null;
}

/**
 * The categories whose claims must be sourced before publication.
 *
 * Stated once, here, because three places need the same answer: the editor (to
 * ask for a source), the API (to refuse the save with a readable message) and
 * the CHECK constraint `Post_claims_are_sourced` (to refuse it regardless). The
 * database is the one that actually holds; this is what makes the error legible.
 */
export const SOURCED_CATEGORIES: readonly PostCategory[] = ["PEOPLE", "ISSUE"];

/**
 * Slugs the /blog routes have already spent.
 *
 * `/blog/category/people` is the shelf, `/blog/<slug>` is a post, and Next
 * resolves the static segment first — so a post slugged "category" would be a
 * published page with a canonical URL that nothing can reach. Refused at the
 * input rather than discovered later by a crawler.
 */
export const RESERVED_POST_SLUGS: readonly string[] = ["category", "page", "feed"];

export const postInputSchema = z
  .object({
    slug: slugSchema.refine((s) => !RESERVED_POST_SLUGS.includes(s), {
      message: "That slug is taken by a /blog route and would be unreachable",
    }),
    title: z.string().trim().min(1).max(200),
    /** The standfirst — also the meta description and the share card's line. */
    dek: optionalText(500),
    content: z.string().min(1).max(100_000),
    category: postCategorySchema,
    format: postFormatSchema.default("EDITORIAL_FEATURE"),
    /** Visible production notes. A first-hand label cannot exist without one. */
    methodNote: optionalText(1_500),
    /** Screeners, tickets, travel, samples, sponsorship or the absence thereof. */
    disclosure: optionalText(800),
    /** Public note for a factual correction or material revision. */
    correctionNote: optionalText(1_500),
    status: reviewStatusSchema,
    /** Long-tail phrases the piece is written for; the page renders them. */
    tags: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
    /**
     * Where the claims come from. http(s) only — the same rule as every other
     * outward link on the site, and the array shape the database cannot check
     * element by element (a CHECK cannot walk an array without a subquery).
     */
    sources: z.array(httpUrl).max(20).default([]),
    /** People and films the piece is about, in the order it is about them. */
    personIds: z.array(z.string().min(1).max(64)).max(20).default([]),
    movieIds: z.array(z.string().min(1).max(64)).max(20).default([]),
    /**
     * The hero, as our upload pipeline returned it: a site-relative path or a
     * URL on our own bucket. Which hosts count as ours is the web app's
     * question (`isOurObjectUrl`) and the database's (`Post_image_is_ours`);
     * this only refuses the shapes that can never be either.
     */
    image: z
      .union([
        z.literal(""),
        z
          .string()
          .max(500)
          .refine((u) => u.startsWith("/") || /^https:\/\//.test(u), {
            message: "A hero image must be one of ours — upload it, don't link it",
          }),
      ])
      .transform((v) => (v === "" ? undefined : v))
      .optional(),
    imageAlt: optionalText(300),
    imageCredit: optionalText(300),
    imageLicense: optionalText(120),
    imageLicenseUrl: optionalHttpUrl,
    imageSourceUrl: optionalHttpUrl,
  })
  // The application half of the two image CHECKs. A free licence's terms travel
  // with the file: a licence with no source is unverifiable, and credit or alt
  // text with no file describes nothing.
  .refine((p) => !p.imageLicense || Boolean(p.imageSourceUrl), {
    path: ["imageSourceUrl"],
    message: "A licence needs the page it was taken from",
  })
  .refine((p) => Boolean(p.image) || (!p.imageAlt && !p.imageCredit), {
    path: ["image"],
    message: "Alt text and credit describe a hero image — add one, or clear them",
  })
  // And the other direction (`Post_image_needs_alt`). `alt=""` is not "no
  // description" to a screen reader, it is "decorative, skip this" — which
  // over a photograph of the person the piece is about deletes the subject of
  // the article for the reader who most needs it named.
  .refine((p) => !p.image || Boolean(p.imageAlt), {
    path: ["imageAlt"],
    message: "Say what the picture shows — a hero without alt text is skipped by screen readers",
  })
  // The application half of `Post_claims_are_sourced`. The database refuses the
  // row either way; this is what turns a 500 into a sentence the editor can act
  // on, attached to the field that is wrong.
  .refine(
    (p) =>
      p.status !== "PUBLISHED" ||
      !SOURCED_CATEGORIES.includes(p.category) ||
      p.sources.length > 0,
    {
      path: ["sources"],
      message:
        "A post about people or a live argument needs at least one source before it can be published",
    },
  )
  .refine(
    (p) =>
      p.status !== "PUBLISHED" ||
      p.format !== "FIRST_HAND_GUIDE" ||
      Boolean(p.methodNote && p.methodNote.length >= 20),
    {
      path: ["methodNote"],
      message:
        "A first-hand guide must say what was watched, visited, tested or compared",
    },
  )
  .refine(
    (p) =>
      p.status !== "PUBLISHED" ||
      p.format !== "FIRST_HAND_GUIDE" ||
      Boolean(p.disclosure?.trim()),
    {
      path: ["disclosure"],
      message:
        "A first-hand guide must disclose who paid for access, travel or equipment",
    },
  )
  .refine(
    (p) =>
      p.status !== "PUBLISHED" ||
      !EVIDENCE_FORMATS.includes(p.format) ||
      p.sources.length > 0 ||
      Boolean(p.methodNote && p.methodNote.length >= 20),
    {
      path: ["methodNote"],
      message: "A utility piece needs sources or a method note describing our own test",
    },
  );
export type PostInput = z.infer<typeof postInputSchema>;

export interface PostQualityIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

/**
 * Editorial checks that are useful in the browser, CLI and doctor alike.
 *
 * Errors defend claims ("first hand", "comparison", "checklist") that would
 * otherwise be unsupported. Warnings describe a strong house shape without
 * turning word counts or a particular Markdown construction into fake quality.
 */
export function auditPostQuality(
  post: Pick<
    PostInput,
    | "title"
    | "dek"
    | "content"
    | "format"
    | "methodNote"
    | "disclosure"
    | "sources"
    | "tags"
    | "personIds"
    | "movieIds"
  >,
): PostQualityIssue[] {
  const issues: PostQualityIssue[] = [];
  const plain = post.content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]*\)/g, " ")
    .replace(/[`*_>#|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = plain ? plain.split(" ").length : 0;
  const headings = [...post.content.matchAll(/^##\s+.+$/gm)].length;
  const listItems = [...post.content.matchAll(/^\s*(?:[-*+] |\d+[.)]\s+)/gm)].length;
  const checklistItems = [...post.content.matchAll(/^\s*[-*+]\s+\[[ xX]\]\s+/gm)].length;
  const hasTable = /^\s*\|.+\|\s*$/m.test(post.content) && /^\s*\|?\s*:?-{3,}/m.test(post.content);
  const hasEvidence = post.sources.length > 0 || Boolean(post.methodNote?.trim());

  const warn = (code: string, message: string) =>
    issues.push({ level: "warning", code, message });
  const error = (code: string, message: string) =>
    issues.push({ level: "error", code, message });

  if (!post.dek?.trim()) warn("standfirst", "Add a standfirst that answers the reader before the article begins.");
  if (words < 600) warn("depth", `The body is about ${words} words; confirm it fully answers the question rather than padding it.`);
  if (headings < 3) warn("structure", "Use at least three descriptive sections so the argument is easy to scan.");
  if (post.tags.length < 3) warn("findability", "Add three or more readable phrases that match how a reader would look for this piece.");
  if (post.personIds.length + post.movieIds.length === 0) {
    warn("subjects", "Link the people or films this piece is about so it joins the site's editorial graph.");
  }

  if (post.format === "FIRST_HAND_GUIDE" && (post.methodNote?.trim().length ?? 0) < 20) {
    error("first-hand-method", "A first-hand guide must disclose what was watched, visited, tested or compared.");
  }
  if (EVIDENCE_FORMATS.includes(post.format) && !hasEvidence) {
    error("utility-evidence", "This utility format needs sources or a visible method note.");
  }

  if (post.format === "COMPARISON" && !hasTable) {
    warn("comparison-table", "A consistent comparison table would make the trade-offs verifiable at a glance.");
  }
  if (post.format === "CHECKLIST" && Math.max(checklistItems, listItems) < 5) {
    warn("checklist-items", "A checklist should expose at least five concrete checks a reader can complete.");
  }
  if (post.format === "ROUNDUP" && Math.max(headings, listItems) < 3) {
    warn("roundup-items", "State the inclusion rule and give at least three entries an individual reason to be included.");
  }
  if (post.format === "PROBLEM_SOLVING" && headings < 3 && listItems < 3) {
    warn("problem-steps", "Make the problem, decision path and usable next steps visibly distinct.");
  }
  if (post.format === "FIRST_HAND_GUIDE" && !post.disclosure?.trim()) {
    error("experience-disclosure", "State who paid for tickets, access, travel or equipment, even when the answer is CinePixo.");
  }

  return issues;
}

/**
 * The hostname a source URL is credited as: "variety.com" from a Variety link.
 *
 * Derived rather than typed in, because a label the editor types is a label
 * that can disagree with the link beside it — and the one thing a sources line
 * must not do is misattribute. `www.` goes; the rest is the publisher's own
 * name for itself.
 */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

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
 *
 * Hyphens are trimmed from **both** ends. Only the trailing side was, which held
 * up until a bulk import met "-30-", a real 1959 film: its slug came out as
 * `-30-1959`, the CHECK constraint that requires `^[a-z0-9]…` rejected the row,
 * and a 500-film batch went down with it.
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
      .replace(/^-+|-+$/g, "") || "film";
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
