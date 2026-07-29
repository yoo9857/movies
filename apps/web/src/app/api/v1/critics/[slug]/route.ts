import { prisma } from "@cinepixo/db";
import { slugSchema } from "@cinepixo/shared";
import { ApiError, handle, json } from "@/lib/api";

export const GET = handle(async (_request: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) throw new ApiError(404, "Critic not found");

  const critic = await prisma.critic.findUnique({ where: { slug: parsed.data } });
  if (!critic) throw new ApiError(404, "Critic not found");

  return json({ critic });
});
