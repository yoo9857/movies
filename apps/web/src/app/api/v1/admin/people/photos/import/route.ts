import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { handle, json, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { fetchRemoteImage, processImage } from "@/lib/media/image";
import { buildKey, putPublicObject } from "@/lib/media/storage";

/**
 * Turn the profile paths we hold into portraits we own — a batch at a time.
 *
 * Every person carrying a `tmdbProfilePath` and no `image` gets those bytes
 * pulled once, run through our pipeline, and stored under our own key. After
 * this the page serves our object: the source has done its job and we no longer
 * depend on it staying up.
 *
 * Batched rather than "do everything", because image work is the most expensive
 * thing this server does and a request that re-encodes hundreds of portraits is
 * a request that times out. The response says how many are left, so the caller
 * loops until `remaining` is zero.
 *
 * People with no path are the ones we have to research ourselves — they are
 * reported here so the work is visible rather than silently absent.
 */

const bodySchema = z.object({
  // One batch is a handful of seconds of sharp time at the pipeline's concurrency of 1.
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { limit } = bodySchema.parse(
    await request.json().catch(() => ({}) as Record<string, unknown>),
  );

  const pending = await prisma.person.findMany({
    where: { image: null, tmdbProfilePath: { not: null } },
    select: { id: true, name: true, tmdbProfilePath: true },
    orderBy: { name: "asc" },
    take: limit,
  });

  const imported: string[] = [];
  const failed: { name: string; reason: string }[] = [];

  for (const person of pending) {
    try {
      // "original" because we are about to resize anyway — starting from the
      // largest available keeps the crop sharp.
      const buf = await fetchRemoteImage(
        `https://image.tmdb.org/t/p/original${person.tmdbProfilePath}`,
      );
      const image = await processImage(buf, { fullWidth: 640, square: true });
      const url = await putPublicObject(
        buildKey("people", image.ext),
        image.full.data,
        image.contentType,
      );
      await prisma.person.update({ where: { id: person.id }, data: { image: url } });
      imported.push(person.name);
    } catch (e) {
      // One bad source must not abandon the rest of the batch.
      failed.push({
        name: person.name,
        reason: e instanceof Error ? e.message : "unknown error",
      });
    }
  }

  const [remaining, needResearch] = await Promise.all([
    prisma.person.count({ where: { image: null, tmdbProfilePath: { not: null } } }),
    prisma.person.count({ where: { image: null, tmdbProfilePath: null } }),
  ]);

  return json({
    imported,
    failed,
    remaining,
    // Nobody upstream has a photo for these; they need our own research.
    needResearch,
  });
});
