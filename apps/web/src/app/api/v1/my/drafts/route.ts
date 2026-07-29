import { prisma } from "@cinepixo/db";
import { ratingSchema, reviewStatusSchema, slugSchema, spoilerLevelSchema } from "@cinepixo/shared";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Autosave is deliberately permissive: a half-written draft must be storable,
// or the feature fails exactly when it is needed. Drafts are private and never
// rendered publicly, so the only hard limits here are size limits.
const draftSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z.string().max(200).default(""),
  verdict: z.string().max(300).default(""),
  excerpt: z.string().max(500).default(""),
  content: z.string().max(100_000).default(""),
  rating: ratingSchema.default(7),
  spoilers: spoilerLevelSchema.default("NONE"),
  movieId: z.string().max(64).default(""),
  slug: z.string().max(120).default(""),
});

// Drafts need a slug for the unique index long before the author has chosen
// one. A namespaced placeholder keeps the column valid and is replaced the
// moment the review is published through the normal validated path.
function placeholderSlug(userId: string): string {
  return `draft-${userId.slice(0, 8)}-${Date.now().toString(36)}`;
}

export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  const user = await requireUser();
  // one save every ~4s per author, with headroom for a second tab
  rateLimit(`draft:${user.id}`, 40, 60_000);
  rateLimit(`draft-ip:${clientIp(request)}`, 120, 60_000);

  const d = draftSchema.parse(await parseJson(request));

  // A film is required by the schema relation, so until one is chosen there is
  // nothing to attach the draft to — the client keeps it locally until then.
  if (!d.movieId) throw new ApiError(422, "Pick a film before the draft can be saved on the server");
  const movie = await prisma.movie.findUnique({ where: { id: d.movieId }, select: { id: true } });
  if (!movie) throw new ApiError(400, "Unknown movieId");

  // Only reuse a slug the author actually typed and that is valid and free.
  async function usableSlug(current?: string): Promise<string | undefined> {
    const parsed = slugSchema.safeParse(d.slug);
    if (!parsed.success) return undefined;
    if (current === parsed.data) return parsed.data;
    const taken = await prisma.review.findUnique({
      where: { slug: parsed.data },
      select: { id: true },
    });
    return taken ? undefined : parsed.data;
  }

  const fields = {
    title: d.title.slice(0, 200),
    verdict: d.verdict || null,
    excerpt: d.excerpt || null,
    content: d.content,
    rating: d.rating,
    spoilers: d.spoilers,
    movieId: d.movieId,
  };

  if (d.id) {
    const existing = await prisma.review.findUnique({
      where: { id: d.id },
      select: { id: true, authorId: true, status: true, slug: true },
    });
    // same 404 for missing and someone else's, so drafts can't be probed
    if (!existing || existing.authorId !== user.id) throw new ApiError(404, "Draft not found");
    if (existing.status !== "DRAFT") {
      // A published review is only ever changed through the validated PUT.
      throw new ApiError(409, "This review is published — use Save to update it");
    }
    const slug = await usableSlug(existing.slug);
    const saved = await prisma.review.update({
      where: { id: existing.id },
      data: { ...fields, ...(slug ? { slug } : {}) },
      select: { id: true, updatedAt: true },
    });
    return json({ id: saved.id, savedAt: saved.updatedAt });
  }

  const slug = (await usableSlug()) ?? placeholderSlug(user.id);
  const created = await prisma.review.create({
    data: { ...fields, slug, status: "DRAFT", publishedAt: null, authorId: user.id },
    select: { id: true, updatedAt: true },
  });
  return json({ id: created.id, savedAt: created.updatedAt }, { status: 201 });
});

// List the author's drafts, newest touched first — used to offer a resume.
export const GET = handle(async () => {
  const user = await requireUser();
  const drafts = await prisma.review.findMany({
    where: { authorId: user.id, status: reviewStatusSchema.parse("DRAFT") },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      movie: { select: { title: true } },
    },
  });
  return json({ drafts });
});
