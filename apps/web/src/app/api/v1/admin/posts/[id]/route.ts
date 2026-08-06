import { prisma } from "@cinepixo/db";
import { postInputSchema } from "@cinepixo/shared";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { assertHeroIsOurs, postWriteData, syncPostSubjects } from "@/lib/post-write";

const idSchema = z.string().min(1).max(64);

/**
 * Drop the cached post listings after an edit.
 *
 * `{ expire: 0 }` rather than the recommended `"max"`: that profile marks the
 * tag stale and serves the old rows once more while the fresh ones load, which
 * is right for a reader and wrong for the editor who just pressed save and is
 * looking for their change. `updateTag` would say this more directly but is
 * Server-Actions-only, and this is a route handler.
 */
function dropPostListings(): void {
  revalidateTag("posts", { expire: 0 });
}

export const PUT = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { id } = await ctx.params;
  const postId = idSchema.parse(id);
  const input = postInputSchema.parse(await parseJson(request));
  assertHeroIsOurs(input);

  const existing = await prisma.post.findUnique({
    where: { id: postId },
    // The publication date has to come out of the row: re-saving a published
    // post must not restamp it. See `postWriteData`.
    select: { id: true, publishedAt: true },
  });
  if (!existing) throw new ApiError(404, "Post not found");

  const clash = await prisma.post.findFirst({
    where: {
      NOT: { id: postId },
      OR: [{ slug: input.slug }, { title: { equals: input.title, mode: "insensitive" } }],
    },
    select: { title: true },
  });
  if (clash) throw new ApiError(409, `A post titled "${clash.title}" already exists`);

  const post = await prisma.post.update({
    where: { id: postId },
    data: postWriteData(input, existing.publishedAt),
    select: { id: true, slug: true },
  });
  await syncPostSubjects(post.id, input);
  dropPostListings();

  return json({ post });
});

export const DELETE = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { id } = await ctx.params;
  const postId = idSchema.parse(id);

  const existing = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!existing) throw new ApiError(404, "Post not found");

  // The subject links cascade. Any hero image stays in the bucket: objects are
  // never deleted when text stops referencing them — orphans are cheap, and a
  // GC that deletes a file still linked from somewhere is not.
  await prisma.post.delete({ where: { id: postId } });
  dropPostListings();
  return json({ ok: true });
});
