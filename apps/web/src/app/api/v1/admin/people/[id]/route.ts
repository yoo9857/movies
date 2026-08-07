import { prisma } from "@cinepixo/db";
import { personInputSchema } from "@cinepixo/shared";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

/**
 * Edit what we know about a person.
 *
 * Everything writable here is ours: the bio and notes we wrote, their dates,
 * where they were born, links we verified. The name and slug are editable too —
 * a credit imported with a bad transliteration should be fixable — but the slug
 * is a public URL, so changing it is a deliberate act and the old one stops
 * resolving. (Films keep their slug forever for that reason; a person we are
 * still researching is a different case.)
 */

const idSchema = z.string().min(1).max(64);

export const PUT = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { id } = await ctx.params;
  const personId = idSchema.parse(id);
  const input = personInputSchema.parse(await parseJson(request));

  const existing = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true },
  });
  if (!existing) throw new ApiError(404, "Person not found");

  const clash = await prisma.person.findFirst({
    where: { slug: input.slug, NOT: { id: personId } },
    select: { id: true },
  });
  if (clash) throw new ApiError(409, "Another person already uses that slug");

  const person = await prisma.person.update({
    where: { id: personId },
    data: {
      slug: input.slug,
      name: input.name,
      bio: input.bio ?? null,
      notes: input.notes ?? null,
      birthPlace: input.birthPlace ?? null,
      deathPlace: input.deathPlace ?? null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      deathDate: input.deathDate ? new Date(input.deathDate) : null,
      // An empty list means "remove every link" — undefined would mean "keep
      // them", which made links impossible to clear from the form.
      links: input.links,
    },
  });

  return json({ person });
});
