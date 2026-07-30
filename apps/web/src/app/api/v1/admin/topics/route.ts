import { prisma } from "@cinepixo/db";
import { topicInputSchema } from "@cinepixo/shared";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

/**
 * The taxonomy is small and hand-curated, so the list endpoint returns all of
 * it — pagination on a few dozen editorial axes would be ceremony.
 */

export const GET = handle(async () => {
  await requireAdmin();
  const topics = await prisma.topic.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { movies: true } } },
  });
  return json({ topics });
});

export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  await requireAdmin();

  const input = topicInputSchema.parse(await parseJson(request));

  // Checked here for a readable error; the database enforces both anyway
  // (unique slug, unique LOWER(name)).
  const clash = await prisma.topic.findFirst({
    where: {
      OR: [{ slug: input.slug }, { name: { equals: input.name, mode: "insensitive" } }],
    },
    select: { name: true },
  });
  if (clash) throw new ApiError(409, `A topic named "${clash.name}" already exists`);

  const topic = await prisma.topic.create({
    data: {
      slug: input.slug,
      name: input.name,
      kind: input.kind,
      description: input.description ?? null,
      essay: input.essay ?? null,
    },
  });
  return json({ topic }, { status: 201 });
});
