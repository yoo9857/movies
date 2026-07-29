import { prisma } from "@cinepixo/db";
import { criticInputSchema } from "@cinepixo/shared";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export const GET = handle(async () => {
  await requireAdmin();
  const critics = await prisma.critic.findMany({ orderBy: { name: "asc" } });
  return json({ critics });
});

export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  await requireAdmin();
  const input = criticInputSchema.parse(await parseJson(request));

  const existing = await prisma.critic.findUnique({ where: { slug: input.slug } });
  if (existing) throw new ApiError(409, "A critic with this slug already exists");

  const critic = await prisma.critic.create({
    data: {
      slug: input.slug,
      name: input.name,
      bio: input.bio,
      avatarUrl: input.avatarUrl,
      links: JSON.stringify(input.links),
    },
  });
  return json({ critic }, { status: 201 });
});
