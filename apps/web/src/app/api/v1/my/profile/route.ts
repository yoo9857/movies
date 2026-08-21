import { prisma } from "@cinepixo/db";
import { profileInputSchema } from "@cinepixo/shared";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const PUT = handle(async (request: Request) => {
  requireSameOrigin(request);
  const user = await requireUser();
  const input = profileInputSchema.parse(await parseJson(request));
  if (!input.bio) {
    const published = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        _count: {
          select: {
            reviews: { where: { status: "PUBLISHED" } },
            posts: { where: { status: "PUBLISHED" } },
          },
        },
      },
    });
    if ((published?._count.reviews ?? 0) + (published?._count.posts ?? 0) > 0) {
      throw new ApiError(400, "A public writer biography cannot be removed while work is published");
    }
  }

  const profile = await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName: input.displayName ?? null,
      bio: input.bio ?? null,
    },
    select: { username: true, displayName: true, bio: true },
  });

  return json({ profile });
});
