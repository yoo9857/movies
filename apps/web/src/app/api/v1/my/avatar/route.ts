import { prisma } from "@cinepixo/db";
import { handle, json, requireSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { processImage, readUpload } from "@/lib/media/image";
import { buildKey, deleteByUrl, putPublicObject } from "@/lib/media/storage";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Replace the signed-in member's avatar.
 *
 * The old object is deleted only after the new URL is committed, so a failure
 * anywhere leaves the account with a working picture rather than a broken one.
 */
export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  const user = await requireUser();
  // Image work is the most expensive thing an authenticated request can ask
  // for, so it is limited per account as well as per address.
  rateLimit(`avatar:${user.id}`, 6, 60 * 60_000);
  rateLimit(`avatar-ip:${clientIp(request)}`, 20, 60 * 60_000);

  const buf = await readUpload(request, "file");
  // Avatars are square and small: a 3:2 portrait shrunk into a circle is mostly
  // forehead, and no avatar is ever displayed above 256px.
  const image = await processImage(buf, { fullWidth: 512, square: true });

  const url = await putPublicObject(
    buildKey("avatars", image.ext),
    image.full.data,
    image.contentType,
  );

  const previous = await prisma.user
    .findUnique({ where: { id: user.id }, select: { avatarUrl: true } })
    .then((u) => u?.avatarUrl ?? null);

  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: url } });

  // Now that the record points at the new object, the old one is garbage.
  if (previous && previous !== url) await deleteByUrl(previous);

  return json({ avatarUrl: url, width: image.width, height: image.height });
});

export const DELETE = handle(async (request: Request) => {
  requireSameOrigin(request);
  const user = await requireUser();

  const previous = await prisma.user
    .findUnique({ where: { id: user.id }, select: { avatarUrl: true } })
    .then((u) => u?.avatarUrl ?? null);

  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
  await deleteByUrl(previous);

  return json({ avatarUrl: null });
});
