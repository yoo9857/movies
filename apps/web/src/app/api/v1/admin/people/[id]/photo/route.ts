import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { fetchRemoteImage, processImage, readUpload } from "@/lib/media/image";
import { buildKey, deleteByUrl, putPublicObject } from "@/lib/media/storage";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * A person's portrait, as an object we own.
 *
 * Two ways in, both ending in the same place: a file from this machine, or a
 * URL we pull. Either way the bytes go through the hardened pipeline — probed
 * rather than trusted, EXIF (and its GPS) stripped by re-encoding, bounded
 * against decompression bombs — and are stored under our own key. Nothing here
 * ever writes a foreign URL into `Person.image`, because a hotlink is not a
 * photograph we have; it is a request we send our readers somewhere else.
 *
 * Portraits are square: the cast rail and the person page both show a circle,
 * and a 2:3 headshot cropped to a circle is mostly forehead.
 */

const idSchema = z.string().min(1).max(64);
const fromUrlSchema = z.object({ url: z.string().url().max(1000) });

async function storePortrait(buf: Buffer): Promise<{ url: string; width: number; height: number }> {
  const image = await processImage(buf, { fullWidth: 640, square: true });
  const url = await putPublicObject(
    buildKey("people", image.ext),
    image.full.data,
    image.contentType,
  );
  return { url, width: image.width, height: image.height };
}

/** Swap in a new portrait, deleting the old object only once the row points away. */
async function commit(personId: string, url: string) {
  const previous = await prisma.person
    .findUnique({ where: { id: personId }, select: { image: true } })
    .then((p) => p?.image ?? null);

  await prisma.person.update({ where: { id: personId }, data: { image: url } });

  if (previous && previous !== url) await deleteByUrl(previous);
}

export const POST = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  const admin = await requireAdmin();
  rateLimit(`person-photo:${admin.id}`, 60, 60 * 60_000);
  rateLimit(`person-photo-ip:${clientIp(request)}`, 120, 60 * 60_000);

  const { id } = await ctx.params;
  const personId = idSchema.parse(id);
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true },
  });
  if (!person) throw new ApiError(404, "Person not found");

  // JSON body means "import from this URL"; anything else is a file upload.
  const contentType = request.headers.get("content-type") ?? "";
  const buf = contentType.includes("application/json")
    ? await fetchRemoteImage(fromUrlSchema.parse(await parseJson(request)).url)
    : await readUpload(request, "file");

  const stored = await storePortrait(buf);
  await commit(personId, stored.url);

  return json(stored, { status: 201 });
});

export const DELETE = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { id } = await ctx.params;
  const personId = idSchema.parse(id);

  const previous = await prisma.person
    .findUnique({ where: { id: personId }, select: { image: true } })
    .then((p) => p?.image ?? null);

  // Back to house initials, which is a presentation and not a gap.
  await prisma.person.update({ where: { id: personId }, data: { image: null } });
  await deleteByUrl(previous);

  return json({ image: null });
});
