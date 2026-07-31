import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { fetchRemoteImage, processImage, readUpload } from "@/lib/media/image";
import { buildKey, deleteByUrl, putPublicObject } from "@/lib/media/storage";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { absUrl } from "@/lib/seo";

/**
 * A film's artwork, replaceable by hand.
 *
 * The import script is fill-only by design — it never displaces what a page
 * already shows — which left no way to *swap* a poster at all: not when the
 * operator has a better scan, not when Commons served the wrong cut. This is
 * that way. Same two doors as a person's portrait (a file from this machine,
 * or a URL we pull), same hardened pipeline, same rule that `Movie.image` only
 * ever holds an object on our own origin.
 *
 * Poster-shaped, so no square crop — a poster cropped square is a different
 * picture. 780 is the widest size any page asks for.
 *
 * Provenance is not optional (a CHECK refuses a file without a source): URL
 * imports default their source to the URL they came from; a bare file upload
 * is the operator's own asset, so its source is the film's own page. Credit
 * and licence fields ride along when given, and the page renders them.
 */

const idSchema = z.string().min(1).max(64);

const provenance = {
  credit: z.string().min(1).max(300).optional(),
  license: z.string().min(1).max(100).optional(),
  licenseUrl: z.string().url().max(500).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
};
const fromUrlSchema = z.object({ url: z.string().url().max(1000), ...provenance });

async function storeArtwork(buf: Buffer): Promise<{ url: string; width: number; height: number }> {
  const image = await processImage(buf, { fullWidth: 780 });
  const url = await putPublicObject(buildKey("films", image.ext), image.full.data, image.contentType);
  return { url, width: image.width, height: image.height };
}

/** Swap in the new artwork, deleting the old object only once the row points away. */
async function commit(
  movieId: string,
  data: {
    image: string;
    imageCredit: string | null;
    imageLicense: string | null;
    imageLicenseUrl: string | null;
    imageSourceUrl: string;
  },
) {
  const previous = await prisma.movie
    .findUnique({ where: { id: movieId }, select: { image: true } })
    .then((m) => m?.image ?? null);

  await prisma.movie.update({ where: { id: movieId }, data });

  if (previous && previous !== data.image) await deleteByUrl(previous);
}

export const POST = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  const admin = await requireAdmin();
  rateLimit(`movie-artwork:${admin.id}`, 60, 60 * 60_000);
  rateLimit(`movie-artwork-ip:${clientIp(request)}`, 120, 60 * 60_000);

  const { id } = await ctx.params;
  const movieId = idSchema.parse(id);
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    select: { id: true, slug: true },
  });
  if (!movie) throw new ApiError(404, "Movie not found");

  // JSON body means "import from this URL"; anything else is a file upload.
  const contentType = request.headers.get("content-type") ?? "";
  let buf: Buffer;
  let meta: z.infer<typeof fromUrlSchema> | null = null;
  if (contentType.includes("application/json")) {
    meta = fromUrlSchema.parse(await parseJson(request));
    buf = await fetchRemoteImage(meta.url);
  } else {
    buf = await readUpload(request, "file");
  }

  const stored = await storeArtwork(buf);
  await commit(movie.id, {
    image: stored.url,
    imageCredit: meta?.credit ?? null,
    imageLicense: meta?.license ?? null,
    imageLicenseUrl: meta?.licenseUrl ?? null,
    // The CHECK's floor: where this picture came from. A URL import came from
    // its URL; an upload is the operator's own, standing behind the film page.
    imageSourceUrl: meta?.sourceUrl ?? meta?.url ?? absUrl(`/movies/${movie.slug}`),
  });

  return json(stored, { status: 201 });
});

export const DELETE = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSameOrigin(request);
  await requireAdmin();

  const { id } = await ctx.params;
  const movieId = idSchema.parse(id);

  const previous = await prisma.movie
    .findUnique({ where: { id: movieId }, select: { image: true } })
    .then((m) => m?.image ?? null);

  // Back to the TMDB path where one exists, the house card where none does —
  // both presentations, neither a gap. Credit goes with the file it credited.
  await prisma.movie.update({
    where: { id: movieId },
    data: {
      image: null,
      imageCredit: null,
      imageLicense: null,
      imageLicenseUrl: null,
      imageSourceUrl: null,
    },
  });
  await deleteByUrl(previous);

  return json({ image: null });
});
