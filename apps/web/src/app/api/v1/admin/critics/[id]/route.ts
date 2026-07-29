import { prisma } from "@cinepixo/db";
import { criticInputSchema } from "@cinepixo/shared";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

const idSchema = z.string().min(1).max(64);

export const PUT = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();
  const { id } = await ctx.params;
  const criticId = idSchema.parse(id);

  const input = criticInputSchema.parse(await parseJson(request));

  const current = await prisma.critic.findUnique({ where: { id: criticId } });
  if (!current) throw new ApiError(404, "Critic not found");

  const slugTaken = await prisma.critic.findFirst({
    where: { slug: input.slug, NOT: { id: criticId } },
  });
  if (slugTaken) throw new ApiError(409, "A critic with this slug already exists");

  const critic = await prisma.critic.update({
    where: { id: criticId },
    data: {
      slug: input.slug,
      name: input.name,
      bio: input.bio ?? null,
      avatarUrl: input.avatarUrl ?? null,
      links: JSON.stringify(input.links),
    },
  });
  return json({ critic });
});

export const DELETE = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();
  const { id } = await ctx.params;
  const criticId = idSchema.parse(id);

  const current = await prisma.critic.findUnique({ where: { id: criticId } });
  if (!current) throw new ApiError(404, "Critic not found");

  await prisma.critic.delete({ where: { id: criticId } });
  return json({ ok: true });
});
