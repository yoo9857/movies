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
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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
 * Fetch an image from elsewhere so it can become one of ours.
 *
 * The point of this function is ownership: a remote URL rendered directly is a
 * hotlink — it can rot, it leaks our readers' requests to another host, and it
 * is not ours in any sense. Pulled through here and then through
 * `processImage`, the bytes land on our storage, stripped and re-encoded, and
 * the page serves our object.
 *
 * Only https, and the size is capped before the body is read — a redirect to
 * something enormous must not be able to exhaust the process.
 *
 * It is also the one place the server fetches a caller-supplied URL, which is
 * the classic SSRF shape: without a guard, an admin form field can be aimed at
 * 127.0.0.1, the LAN, or a cloud metadata endpoint. Every hop — the URL itself
 * and each redirect target, since a public host can bounce to a private one —
 * must resolve to a public address before it is fetched. (A DNS answer that
 * changes between our lookup and fetch's own could still slip through; closing
 * that needs a pinned-IP dispatcher, more than this admin-only path warrants.)
 */

/** True for addresses that must never be fetched: loopback, LAN, link-local, metadata. */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const o = ip.split(".").map(Number);
    return (
      o[0] === 0 || // "this network"
      o[0] === 10 ||
      o[0] === 127 || // loopback
      (o[0] === 100 && o[1] >= 64 && o[1] <= 127) || // CGNAT
      (o[0] === 169 && o[1] === 254) || // link-local / cloud metadata
      (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
      (o[0] === 192 && o[1] === 0 && o[2] === 0) || // IETF protocol assignments
      (o[0] === 192 && o[1] === 168) ||
      (o[0] === 198 && (o[1] === 18 || o[1] === 19)) || // benchmarking
      o[0] >= 224 // multicast + reserved
    );
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    // IPv4 embedded in IPv6 (::ffff:10.0.0.1, NAT64) — judge the inner address.
    const embedded = lower.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (embedded) return isPrivateAddress(embedded[1]);
    return (
      lower === "::" ||
      lower === "::1" || // loopback
      lower.startsWith("fc") || lower.startsWith("fd") || // unique local
      lower.startsWith("fe8") || lower.startsWith("fe9") ||
      lower.startsWith("fea") || lower.startsWith("feb") || // link-local
      lower.startsWith("ff") // multicast
    );
  }
  return true; // not an IP at all — refuse rather than guess
}

async function assertPublicHost(url: URL): Promise<void> {
  // URL brackets IPv6 literals; strip them so isIP recognises the form.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new ApiError(400, "That URL points at a private address");
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new ApiError(502, "Could not resolve that host");
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new ApiError(400, "That URL points at a private address");
  }
}

const MAX_REDIRECTS = 5;

/**
 * Who we say we are when fetching someone else's file.
 *
 * Not politeness: Wikimedia's User-Agent policy is enforced, and an anonymous
 * bulk fetcher gets 429s — which is exactly what a portrait and artwork run hit,
 * seven films in twenty-five, until this was sent.
 */
const IMPORT_USER_AGENT = "CinePixo/0.1 (+https://cinepixo.com; devoh@signpost.kr)";

export async function fetchRemoteImage(url: string): Promise<Buffer> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new ApiError(400, "That is not a valid URL");
  }

  // Redirects are followed by hand so each hop faces the same two checks:
  // https only, public address only.
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "https:") {
      throw new ApiError(400, "Only https image URLs can be imported");
    }
    await assertPublicHost(current);

    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": IMPORT_USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ApiError(502, "Could not reach that image");
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new ApiError(502, "Source redirected nowhere");
      current = new URL(location, current);
      res = null;
      continue;
    }
    break;
  }
  if (!res) throw new ApiError(502, "Source redirected too many times");
  if (!res.ok) throw new ApiError(502, `Source returned ${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES) throw new ApiError(413, "That image is larger than 20 MB");

  const buf = Buffer.from(await res.arrayBuffer());
  // Content-Length is a hint, not a promise — check the bytes we actually got.
  if (buf.length > MAX_UPLOAD_BYTES) throw new ApiError(413, "That image is larger than 20 MB");
  if (buf.length === 0) throw new ApiError(502, "Source returned an empty image");
  return buf;
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
