import { prisma } from "@cinepixo/db";
import { postInputSchema } from "@cinepixo/shared";
import { revalidateTag } from "next/cache";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { assertHeroIsOurs, postWriteData, syncPostSubjects } from "@/lib/post-write";

/**
 * The blog is editorial: only an admin writes here, and the list is small enough
 * that pagination would be ceremony. Reviews are the members' half of the site;
 * this half is signed by the desk.
 */

export const GET = handle(async () => {
  await requireAdmin();
  const posts = await prisma.post.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      sources: true,
      author: { select: { username: true, displayName: true } },
      _count: { select: { people: true, movies: true } },
    },
  });
  return json({ posts });
});

export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  const admin = await requireAdmin();

  const input = postInputSchema.parse(await parseJson(request));
  assertHeroIsOurs(input);

  // Checked here for a readable error; the database enforces both anyway
  // (unique slug, unique LOWER(title)).
  const clash = await prisma.post.findFirst({
    where: {
      OR: [{ slug: input.slug }, { title: { equals: input.title, mode: "insensitive" } }],
    },
    select: { title: true },
  });
  if (clash) throw new ApiError(409, `A post titled "${clash.title}" already exists`);

  const post = await prisma.post.create({
    data: { ...postWriteData(input, null), authorId: admin.id },
    select: { id: true, slug: true },
  });
  await syncPostSubjects(post.id, input);
  // The listings hold their rows for a minute; a new piece should not. Expire
  // rather than mark stale — the editor is about to go looking for it.
  revalidateTag("posts", { expire: 0 });

  return json({ post }, { status: 201 });
});
