/**
 * Image ingest.
 *
 * Ported from the pokemondive service, where these bounds were arrived at on a
 * single-vCPU box under real uploads. Every user image on the site goes through
 * this one function, so the guarantees hold everywhere:
 *
 *  · **the declared type is never trusted** — the buffer is probed, and a file
 *    claiming to be a PNG that isn't simply fails to decode
 *  · **EXIF is stripped** by re-encoding, which also removes GPS coordinates
 *    someone did not mean to publish
 *  · **decompression bombs are bounded** by pixel count before any decode, not
 *    by file size: a 40KB PNG can expand to gigabytes
 *  · **animation is sampled, not rejected** — frames are decoded one at a time
 *    because a GIF page-i decode replays from frame 0, making the naive loop
 *    quadratic
 *  · **sharp runs one job at a time** and a flood of uploads queues briefly and
 *    then sheds load, instead of every request racing for the same heap
 */
import sharp, { type Metadata, type OutputInfo } from "sharp";
import { ApiError } from "@/lib/api";

sharp.concurrency(1); // shared box — never fan out image work
sharp.cache(false);

export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

/** Generous: everything is re-encoded, so a big source is fine. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const FULL_WIDTH = 1600;
const THUMB_WIDTH = 480;
const ANIM_FULL_WIDTH = 720; // animated frames re-encode per frame — keep them lean
const ANIM_THUMB_WIDTH = 320;

// Adaptive animation budget: oversized inputs are optimised, not refused.
const ANIM_MAX_OUT_FRAMES = 60; // sampled evenly across the source
const ANIM_MAX_IN_FRAMES = 400; // keeps the quadratic worst case bounded
const FRAME_MAX_PIXELS = 24_000_000;
const STATIC_MAX_PIXELS = 60_000_000;

// Processing semaphore.
const QUEUE_MAX_WAITING = 4;
let chain: Promise<unknown> = Promise.resolve();
let waiting = 0;

export function withImageSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (waiting >= QUEUE_MAX_WAITING) {
    return Promise.reject(
      new ApiError(503, "Busy processing uploads — try again in a moment"),
    );
  }
  waiting += 1;
  const run = chain.then(() => {
    waiting -= 1;
    return fn();
  });
  // Keep the chain alive whether the job succeeded or not.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export interface ProcessedImage {
  full: { data: Buffer; info: OutputInfo };
  thumb: { data: Buffer; info: OutputInfo };
  /** per-frame dimensions: animated output stacks its pages vertically */
  width: number;
  height: number;
  animated: boolean;
  contentType: "image/webp";
  ext: "webp";
}

/**
 * Validate and re-encode an upload into a full-size and a thumbnail WebP.
 *
 * `square` crops to a centred square, which is what an avatar wants — a 3:2
 * portrait shrunk into a circle is mostly forehead.
 */
export async function processImage(
  buf: Buffer,
  opts: { fullWidth?: number; square?: boolean } = {},
): Promise<ProcessedImage> {
  if (buf.length === 0) throw new ApiError(400, "That file is empty");
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, "That image is larger than 20 MB");
  }

  const fullWidth = opts.fullWidth ?? FULL_WIDTH;

  let probe: Metadata;
  try {
    // Metadata only — no pixels decoded yet, so a bomb is caught before it costs
    // anything.
    probe = await sharp(buf, { limitInputPixels: false, animated: true }).metadata();
  } catch {
    throw new ApiError(400, "That file is not an image we can read");
  }

  const inW = probe.width ?? 0;
  const inH = probe.pageHeight ?? probe.height ?? 0;
  const pages = probe.pages ?? 1;
  if (!inW || !inH) throw new ApiError(400, "That file is not an image we can read");
  if (inW * inH > (pages > 1 ? FRAME_MAX_PIXELS : STATIC_MAX_PIXELS)) {
    throw new ApiError(413, "That image's resolution is too large");
  }
  if (pages > ANIM_MAX_IN_FRAMES) {
    throw new ApiError(413, "That animation has too many frames");
  }

  const animated = pages > 1 && !opts.square;

  const encoded = await withImageSlot(async () => {
    if (animated) {
      // Decode one frame at a time and sample evenly down to the budget.
      const step = Math.ceil(pages / ANIM_MAX_OUT_FRAMES);
      const frames: Buffer[] = [];
      for (let i = 0; i < pages; i += step) {
        frames.push(
          await sharp(buf, { limitInputPixels: FRAME_MAX_PIXELS, page: i, pages: 1 })
            .rotate()
            .resize({ width: ANIM_FULL_WIDTH, withoutEnlargement: true })
            .png()
            .toBuffer(),
        );
      }
      const delayIn = probe.delay?.[0] ?? 100;
      const delay = Math.min(1000, Math.max(20, delayIn * step));
      const loop = probe.loop ?? 0;

      const full = await sharp(frames, { join: { animated: true } })
        .webp({ quality: 76, effort: 2, loop, delay })
        .toBuffer({ resolveWithObject: true });

      // Reuse the frames already decoded rather than decoding the source twice.
      const thumbFrames: Buffer[] = [];
      for (const fr of frames) {
        thumbFrames.push(
          await sharp(fr)
            .resize({ width: ANIM_THUMB_WIDTH, withoutEnlargement: true })
            .png()
            .toBuffer(),
        );
      }
      const thumb = await sharp(thumbFrames, { join: { animated: true } })
        .webp({ quality: 70, effort: 2, loop, delay })
        .toBuffer({ resolveWithObject: true });

      return { full, thumb };
    }

    // One decode, cloned for both outputs.
    const base = sharp(buf, { limitInputPixels: STATIC_MAX_PIXELS }).rotate();
    const shape = opts.square
      ? { width: fullWidth, height: fullWidth, fit: "cover" as const, position: "centre" }
      : { width: fullWidth, withoutEnlargement: true };

    const full = await base
      .clone()
      .resize(shape)
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    const thumb = await base
      .clone()
      .resize(
        opts.square
          ? { width: THUMB_WIDTH, height: THUMB_WIDTH, fit: "cover" as const, position: "centre" }
          : { width: THUMB_WIDTH, withoutEnlargement: true },
      )
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    return { full, thumb };
  });

  const pagesOut = (encoded.full.info as OutputInfo & { pages?: number }).pages ?? 1;
  return {
    full: encoded.full,
    thumb: encoded.thumb,
    width: encoded.full.info.width,
    height: pagesOut > 1 ? Math.round(encoded.full.info.height / pagesOut) : encoded.full.info.height,
    animated,
    contentType: "image/webp",
    ext: "webp",
  };
}

/**
 * Pull a single file out of a multipart request.
 *
 * Next's route handlers give us `FormData` directly, so there is no multer here
 * — but the same two rules apply: cap the size before buffering, and treat the
 * declared MIME type as a hint the pipeline will verify.
 */
export async function readUpload(request: Request, field = "file"): Promise<Buffer> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES * 1.1) {
    throw new ApiError(413, "That image is larger than 20 MB");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, "Expected a multipart form upload");
  }

  const file = form.get(field);
  if (!(file instanceof File)) throw new ApiError(400, `Attach an image as "${field}"`);
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "That image is larger than 20 MB");
  if (file.type && !ACCEPTED_MIME.includes(file.type)) {
    throw new ApiError(415, "Use a JPEG, PNG, WebP, AVIF or GIF");
  }

  return Buffer.from(await file.arrayBuffer());
}
