import { prisma } from "@cinepixo/db";
import { topicInputSchema } from "@cinepixo/shared";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

const idSchema = z.string().min(1).max(64);

export const PUT = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { id } = await ctx.params;
  const topicId = idSchema.parse(id);
  const input = topicInputSchema.parse(await parseJson(request));

  const existing = await prisma.topic.findUnique({ where: { id: topicId }, select: { id: true } });
  if (!existing) throw new ApiError(404, "Topic not found");

  const clash = await prisma.topic.findFirst({
    where: {
      NOT: { id: topicId },
      OR: [{ slug: input.slug }, { name: { equals: input.name, mode: "insensitive" } }],
    },
    select: { name: true },
  });
  if (clash) throw new ApiError(409, `A topic named "${clash.name}" already exists`);

  const topic = await prisma.topic.update({
    where: { id: topicId },
    data: {
      slug: input.slug,
      name: input.name,
      kind: input.kind,
      description: input.description ?? null,
      essay: input.essay ?? null,
    },
  });
  return json({ topic });
});

export const DELETE = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { id } = await ctx.params;
  const topicId = idSchema.parse(id);

  const existing = await prisma.topic.findUnique({ where: { id: topicId }, select: { id: true } });
  if (!existing) throw new ApiError(404, "Topic not found");

  // Assignments cascade; the films themselves are untouched.
  await prisma.topic.delete({ where: { id: topicId } });
  return json({ ok: true });
});
