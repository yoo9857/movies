// Hero images for house posts, from the places the desk actually gets them.
//
//   cd apps/web && npx tsx scripts/fill-post-images.ts --auto --limit=20
//   npm run post-images -- --auto                        # from the repo root
//
// Modes:
//   --auto [--limit=N] [--youtube]
//       Fill image-less posts from what each post already links: a subject's
//       Commons photograph (full provenance), else a portrait or film artwork
//       already in our bucket. `--youtube` (the bare flag) additionally allows
//       the thumbnail of a YouTube URL the post already cites in `sources`.
//   --images=<file.json>
//       Operator-directed hero jobs, one per post — the shape is below.
//   --post=<slug> with one of --url= / --youtube= / --file= / --capture=<film-slug>
//       The same job as flags, for one-offs. `--alt=` is required; `--credit=`,
//       `--license=`, `--license-url=`, `--source-url=`, `--at=`, `--from=` refine it.
//   --body=<file.json> [--heading=<text>]
//       Body work, not hero work: the same jobs land in the post's markdown —
//       each image as `![alt](url)` with its credit under it, and a job with
//       `"embed": true` as the bare URL on its own line, which the renderer
//       turns into the platform's click-to-load frame (`youtube` for a video;
//       `url` for an X status or Instagram post).
//       A job's `"at": "<heading text>"` puts it above that `##` heading;
//       **jobs sharing one `at` become one row**, rendered side by side, so a
//       piece can run 1 / 2 / 2 / 1 down the page instead of a stack at the
//       bottom. Jobs with no `at` are appended, under `--heading` if given.
//   --post=<slug> --reset-images
//       Take the pictures back out: every `![…](…)` row and its credit line
//       leave the markdown, and the six hero columns are cleared. The prose is
//       untouched, and the objects are left in the bucket — orphans are cheap,
//       and one of them may be a portrait another page still uses. For redoing
//       a picture set without rewriting the piece.
//   --dry     resolve and fetch everything, prove it processes, write nothing
//   --force   replace an existing hero (the old object is left in place —
//             orphans are cheap, GC is not, and a reused portrait must never
//             be deleted out from under its person)
//
// A jobs file is an array of:
//   { "post": "<post slug>",
//     "url"?: "<an image URL, or an article page whose og:image is taken>",
//     "youtube"?: "<video URL — its thumbnail, credited to the channel>",
//     "file"?: "<local path>",
//     "capture"?: { "film": "<movie slug>", "at"?: seconds, "from"?: "trailer"|"film" },
//     "alt": "<what the picture shows — required, it is the caption>",
//     "credit"?, "license"?, "licenseUrl"?, "sourceUrl"?: <overrides> }
//
// The stance on rights, which is the whole design:
//
//  · **--auto takes licensed material only.** A Commons photograph arrives with
//    its credit and licence; a film's `image` artwork was imported under its own
//    terms. Those are the sources a machine may choose unsupervised.
//  · **A YouTube thumbnail is an operator's call, not the machine's** — a flag
//    in --auto, a field in a job. It is credited to the channel and linked to
//    the video, but it is not licensed to us, so a person decides per piece
//    that the editorial use is defensible.
//  · **A captured frame inherits its file's terms.** `trailerFile`/`filmFile`
//    carry credit and licence columns precisely so a still cut from them can
//    carry the same lines.
//  · **Instagram and X photographs are refused by name; their posts embed.**
//    Copying a picture out of either is the rights problem the schema exists
//    to prevent — but both platforms *offer* their posts for embedding, so an
//    `"embed": true` body job (or a pasted post URL in the markdown) shows
//    the post from the platform's own servers, author attached, latest by
//    definition. With actual permission for the file itself, --file with the
//    post's URL as --source-url is still the import path.
//
// Every image lands through the same pipeline as an upload — probed,
// re-encoded, EXIF-stripped, stored on our origin — because
// `Post_image_is_ours` refuses anything else, and a hotlink would rot.
import "../../../packages/db/prisma/env";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { fetchRemoteImage, processImage } from "@/lib/media/image";
import { buildKey, putPublicObject, resolveLocalKey } from "@/lib/media/storage";
import { type CommonsImage, commonsImage, enrich, facts } from "@/lib/wikimedia";
import {
  instagramEmbedUrl,
  isInstagramUrl,
  pageLeadImage,
  xStatusId,
  youtubeThumbnailUrls,
  youtubeVideoId,
  youtubeWatchUrl,
} from "@/lib/post-image-sources";

function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}
function numArg(name: string, fallback: number): number {
  const value = Number(strArg(name));
  return Number.isFinite(value) ? value : fallback;
}

const IMAGES = strArg("images");
const BODY = strArg("body");
const POST = strArg("post");
const AUTO = process.argv.includes("--auto");
const RESET = process.argv.includes("--reset-images");
const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");
/** Bare `--youtube` (no `=`): let --auto take a cited video's thumbnail. */
const YT_IN_AUTO = process.argv.includes("--youtube");
const LIMIT = numArg("limit", 20);
/** Same pacing as the portrait run — Wikimedia throttles the image host hard. */
const PACE = numArg("pace", 1500);

/** Honest, like write-posts' fetcher: a site that refuses this refuses on purpose. */
const BOT_UA = "CinePixoBot/1.0 (+https://cinepixo.com/about)";

/* ── Job shape ───────────────────────────────────────────────── */

const captureSchema = z.object({
  film: z.string().min(1),
  /** Seconds in. Defaults to a quarter of the way through, past the titles. */
  at: z.number().min(0).optional(),
  from: z.enum(["trailer", "film"]).optional(),
});

const jobBase = z.object({
  post: z.string().min(1),
  url: z.string().url().optional(),
  youtube: z.string().url().optional(),
  file: z.string().min(1).optional(),
  capture: captureSchema.optional(),
  /** The caption; the page reads it out loud. Required for every image. */
  alt: z.string().min(3).max(300).optional(),
  credit: z.string().min(1).max(400).optional(),
  license: z.string().min(1).max(200).optional(),
  licenseUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
});
const oneSource = (j: z.infer<typeof jobBase>) =>
  [j.url, j.youtube, j.file, j.capture].filter(Boolean).length === 1;

const jobSchema = jobBase
  .refine(oneSource, { message: "exactly one of url / youtube / file / capture per job" })
  .refine((j) => j.alt, { message: "alt is required", path: ["alt"] });
type Job = z.infer<typeof jobSchema>;

/**
 * A body job may also be a pure embed: no fetch, just the post's URL on its
 * own line, which the renderer turns into the platform's frame. YouTube via
 * `youtube`; an X or Instagram post via `url`.
 */
const bodyJobSchema = jobBase
  .extend({
    embed: z.boolean().optional(),
    /**
     * Where in the piece this belongs: the text of the `##` heading it should
     * sit above. Omitted, it lands at the end. **Jobs sharing one `at` become
     * one row** — two of them render side by side — which is how a page gets
     * a 1 / 2 / 2 / 1 rhythm instead of a column of stacked pictures.
     */
    at: z.string().min(1).optional(),
  })
  .refine(oneSource, { message: "exactly one of url / youtube / file / capture per job" })
  .refine((j) => !j.embed || j.youtube || j.url, {
    message: "embed takes a youtube URL or an X/Instagram post url",
    path: ["embed"],
  })
  .refine((j) => j.embed || j.alt, { message: "alt is required for an image", path: ["alt"] });
type BodyJob = z.infer<typeof bodyJobSchema>;

/**
 * One resolved hero: either bytes to process and store, or the URL of an
 * object that is already ours and can simply be pointed at.
 */
interface Hero {
  buf: Buffer | null;
  reuseUrl: string | null;
  alt: string;
  credit: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
  /** For the log line: where this came from, in words. */
  from: string;
}

/* ── Retry, for the one error worth retrying (as import-portraits) ── */

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const throttled = /\b429\b|too many requests/i.test((e as Error).message);
      if (!throttled || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, attempt * 8_000));
    }
  }
}

/** "https://en.wikipedia.org/wiki/Song_Kang-ho" → "Song Kang-ho" */
function articleTitle(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const raw = path.startsWith("/wiki/") ? path.slice("/wiki/".length) : null;
    return raw ? decodeURIComponent(raw).replace(/_/g, " ") : null;
  } catch {
    return null;
  }
}

/* ── Sources ─────────────────────────────────────────────────── */

/**
 * Bytes for a URL that may be the image itself or an article about it.
 *
 * One look at the content type decides: a page is crawled for the image it
 * nominates (og:image), anything image-shaped goes back through
 * `fetchRemoteImage` so the size caps and host checks apply to what is
 * actually stored.
 */
async function imageAtUrl(url: string): Promise<{ buf: Buffer; page: string | null }> {
  if (isInstagramUrl(url)) {
    throw new Error(
      "Instagram blocks anonymous fetches and its photos are not licensed for reuse — " +
        "with permission in hand, save the file and pass it as `file` with the post's URL as `sourceUrl`",
    );
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": BOT_UA, Accept: "text/html,image/*" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(`could not reach ${url}`);
  }
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);

  const type = res.headers.get("content-type") ?? "";
  if (type.includes("text/html")) {
    // og:image lives in <head>; a page bigger than this is not worth reading.
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > 8_000_000) throw new Error(`${url} is ${declared} bytes of HTML — not a page to crawl`);
    const html = (await res.text()).slice(0, 2_000_000);
    const lead = pageLeadImage(html, res.url || url);
    if (!lead) {
      throw new Error(`${url} is a page that nominates no og:image — pass the image URL itself`);
    }
    return { buf: await fetchRemoteImage(lead), page: url };
  }

  // The body just read is discarded on purpose: fetchRemoteImage re-fetches
  // with its own redirect, host and size discipline, and images are cheap.
  return { buf: await fetchRemoteImage(url), page: null };
}

/** A video's thumbnail plus the credit oEmbed hands over with it. */
async function youtubeHero(
  videoUrl: string,
): Promise<{ buf: Buffer; credit: string; sourceUrl: string; title: string | null }> {
  const id = youtubeVideoId(videoUrl);
  if (!id) throw new Error(`not a YouTube video URL: ${videoUrl}`);
  const watch = youtubeWatchUrl(id);

  // oEmbed is the existence check and the credit in one call — the same probe
  // the trailer importers use before trusting a key.
  interface OEmbed {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  }
  let meta: OEmbed | null = null;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
      { headers: { "User-Agent": BOT_UA }, signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) meta = (await res.json()) as OEmbed;
  } catch {
    // judged below
  }
  if (!meta) {
    throw new Error(`YouTube does not answer for ${id} — private, removed, or embedding disabled`);
  }

  let buf: Buffer | null = null;
  const candidates = [...youtubeThumbnailUrls(id), ...(meta.thumbnail_url ? [meta.thumbnail_url] : [])];
  for (const candidate of candidates) {
    try {
      buf = await fetchRemoteImage(candidate);
      break;
    } catch {
      // maxresdefault does not exist for every video — walk down the list
    }
  }
  if (!buf) throw new Error(`no thumbnail answered for ${id}`);

  return {
    buf,
    credit: meta.author_name ? `${meta.author_name} / YouTube` : "YouTube",
    sourceUrl: watch,
    title: meta.title?.trim() || null,
  };
}

/** One frame, as PNG bytes on stdout. ffmpeg reads our bucket URLs directly. */
function frameAt(input: string, at: number): Buffer {
  let out: Buffer;
  try {
    out = execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel", "error",
        "-ss", String(at),
        "-i", input,
        "-frames:v", "1",
        // Sized here so a 4K master cannot produce a PNG the 20MB pipeline cap refuses.
        "-vf", "scale=min(1600\\,iw):-2",
        "-f", "image2pipe",
        "-c:v", "png",
        "pipe:1",
      ],
      { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 },
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("ffmpeg is not installed — a capture job needs it on this machine");
    }
    throw e;
  }
  // A seek past the end produces nothing rather than an error; back up once.
  if (out.length === 0 && at > 1) return frameAt(input, 1);
  if (out.length === 0) throw new Error("ffmpeg produced no frame");
  return out;
}

/** A still from a film's hosted video, carrying the file's own terms. */
async function captureHero(spec: z.infer<typeof captureSchema>): Promise<{
  buf: Buffer;
  credit: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
  movieTitle: string;
}> {
  const movie = await prisma.movie.findUnique({
    where: { slug: spec.film },
    select: {
      title: true,
      trailerFile: true,
      trailerFileCredit: true,
      trailerFileLicense: true,
      trailerFileLicenseUrl: true,
      trailerFileSourceUrl: true,
      trailerFileDuration: true,
      filmFile: true,
      filmFileCredit: true,
      filmFileLicense: true,
      filmFileLicenseUrl: true,
      filmFileSourceUrl: true,
      filmFileDuration: true,
    },
  });
  if (!movie) throw new Error(`no film with slug ${spec.film}`);

  const from = spec.from ?? (movie.filmFile ? "film" : "trailer");
  const file = from === "film" ? movie.filmFile : movie.trailerFile;
  if (!file) throw new Error(`${movie.title} has no ${from} file to capture from`);

  // The CHECK allows exactly two shapes: our bucket URL (ffmpeg reads https
  // directly) or a site-relative /uploads path the local driver can resolve.
  let input: string;
  if (file.startsWith("https://")) {
    input = file;
  } else {
    const key = file.startsWith("/uploads/") ? file.slice("/uploads/".length) : null;
    const resolved = key ? resolveLocalKey(key) : null;
    if (!resolved) throw new Error(`cannot resolve ${file} to something ffmpeg can read`);
    input = resolved;
  }

  const duration = from === "film" ? movie.filmFileDuration : movie.trailerFileDuration;
  const at =
    spec.at ?? (duration ? Math.max(1, Math.min(Math.round(duration * 0.25), duration - 1)) : 5);

  return {
    buf: frameAt(input, at),
    credit: from === "film" ? movie.filmFileCredit : movie.trailerFileCredit,
    license: from === "film" ? movie.filmFileLicense : movie.trailerFileLicense,
    licenseUrl: from === "film" ? movie.filmFileLicenseUrl : movie.trailerFileLicenseUrl,
    sourceUrl: from === "film" ? movie.filmFileSourceUrl : movie.trailerFileSourceUrl,
    movieTitle: movie.title,
  };
}

/** A person's Commons photograph, with the provenance the licence requires. */
async function personCommonsHero(person: {
  wikidataId: string | null;
  wikipediaUrl: string | null;
}): Promise<CommonsImage | null> {
  if (person.wikidataId) {
    const f = await facts(person.wikidataId);
    if (f?.imageFile) {
      const img = await commonsImage(f.imageFile);
      if (img) return img;
    }
  }
  if (person.wikipediaUrl) {
    const title = articleTitle(person.wikipediaUrl);
    const found = title ? await enrich(title) : null;
    if (found?.image) return found.image;
  }
  return null;
}

/* ── Resolution ──────────────────────────────────────────────── */

async function heroForJob(job: Job): Promise<Hero> {
  // The schemas guarantee alt on every image job; embeds never reach here.
  const alt = job.alt!;
  if (job.url) {
    const { buf, page } = await imageAtUrl(job.url);
    return {
      buf,
      reuseUrl: null,
      alt,
      credit: job.credit ?? null,
      license: job.license ?? null,
      licenseUrl: job.licenseUrl ?? null,
      sourceUrl: job.sourceUrl ?? page ?? job.url,
      from: page ? `og:image of ${page}` : job.url,
    };
  }
  if (job.youtube) {
    const yt = await youtubeHero(job.youtube);
    return {
      buf: yt.buf,
      reuseUrl: null,
      alt,
      credit: job.credit ?? yt.credit,
      license: job.license ?? null,
      licenseUrl: job.licenseUrl ?? null,
      sourceUrl: job.sourceUrl ?? yt.sourceUrl,
      from: `YouTube thumbnail ${yt.sourceUrl}`,
    };
  }
  if (job.file) {
    return {
      buf: readFileSync(job.file),
      reuseUrl: null,
      alt,
      credit: job.credit ?? null,
      license: job.license ?? null,
      licenseUrl: job.licenseUrl ?? null,
      sourceUrl: job.sourceUrl ?? null,
      from: job.file,
    };
  }
  const cap = await captureHero(job.capture!);
  return {
    buf: cap.buf,
    reuseUrl: null,
    alt,
    credit: job.credit ?? cap.credit,
    license: job.license ?? cap.license,
    licenseUrl: job.licenseUrl ?? cap.licenseUrl,
    sourceUrl: job.sourceUrl ?? cap.sourceUrl,
    from: `frame of ${cap.movieTitle}'s ${job.capture!.from ?? "video"} file`,
  };
}

interface AutoPost {
  id: string;
  slug: string;
  title: string;
  sources: string[];
  people: {
    person: {
      name: string;
      image: string | null;
      imageCredit: string | null;
      imageLicense: string | null;
      imageLicenseUrl: string | null;
      imageSourceUrl: string | null;
      wikidataId: string | null;
      wikipediaUrl: string | null;
    };
  }[];
  movies: {
    movie: {
      title: string;
      releaseDate: Date | null;
      image: string | null;
      imageCredit: string | null;
      imageLicense: string | null;
      imageLicenseUrl: string | null;
      imageSourceUrl: string | null;
    };
  }[];
}

/**
 * The licensed-material chain: a fresh Commons photograph of any subject
 * beats an already-imported object, and a person beats a film, because the
 * blog's shelves are mostly about people.
 */
async function autoHero(post: AutoPost): Promise<Hero | null> {
  for (const { person } of post.people) {
    const commons = await personCommonsHero(person);
    if (!commons) continue;
    return {
      buf: await withRetry(() => fetchRemoteImage(commons.url)),
      reuseUrl: null,
      alt: person.name,
      credit: commons.credit,
      license: commons.license,
      licenseUrl: commons.licenseUrl,
      sourceUrl: commons.sourceUrl,
      from: `Commons photograph of ${person.name}`,
    };
  }
  for (const { person } of post.people) {
    if (!person.image) continue;
    return {
      buf: null,
      reuseUrl: person.image,
      alt: person.name,
      credit: person.imageCredit,
      license: person.imageLicense,
      licenseUrl: person.imageLicenseUrl,
      sourceUrl: person.imageSourceUrl,
      from: `our portrait of ${person.name}`,
    };
  }
  for (const { movie } of post.movies) {
    if (!movie.image) continue;
    const year = movie.releaseDate ? ` (${movie.releaseDate.getUTCFullYear()})` : "";
    return {
      buf: null,
      reuseUrl: movie.image,
      alt: `${movie.title}${year}`,
      credit: movie.imageCredit,
      license: movie.imageLicense,
      licenseUrl: movie.imageLicenseUrl,
      sourceUrl: movie.imageSourceUrl,
      from: `our artwork for ${movie.title}`,
    };
  }
  if (YT_IN_AUTO) {
    for (const src of post.sources) {
      if (!youtubeVideoId(src)) continue;
      try {
        const yt = await youtubeHero(src);
        return {
          buf: yt.buf,
          reuseUrl: null,
          alt: yt.title ?? post.title,
          credit: yt.credit,
          license: null,
          licenseUrl: null,
          sourceUrl: yt.sourceUrl,
          from: `thumbnail of a YouTube source`,
        };
      } catch {
        // a dead video is not worth the post — try the next source
      }
    }
  }
  return null;
}

/* ── Storage ─────────────────────────────────────────────────── */

/** Process, store, write — or, dry, prove it would have. */
async function storeHero(post: { id: string; slug: string }, hero: Hero): Promise<string> {
  // The application half of Post_image_license_has_source, so the answer is a
  // sentence here rather than a constraint violation there.
  if (hero.license && !hero.sourceUrl) {
    throw new Error("a licence without its source is refused — supply sourceUrl alongside license");
  }

  let url = hero.reuseUrl;
  if (hero.buf) {
    const processed = await processImage(hero.buf, { fullWidth: 1600 });
    if (DRY) {
      return `(dry) would store ${processed.width}×${processed.height} webp`;
    }
    url = await putPublicObject(
      buildKey("posts", processed.ext),
      processed.full.data,
      processed.contentType,
    );
  } else if (DRY) {
    return `(dry) would point at ${url}`;
  }

  await prisma.post.update({
    where: { id: post.id },
    data: {
      image: url!,
      imageAlt: hero.alt,
      imageCredit: hero.credit,
      imageLicense: hero.license,
      imageLicenseUrl: hero.licenseUrl,
      imageSourceUrl: hero.sourceUrl,
    },
  });
  return url!;
}

/* ── Main ────────────────────────────────────────────────────── */

function jobsFromFlags(): Job[] {
  const capture = strArg("capture");
  const at = strArg("at");
  const from = strArg("from");
  return [
    jobSchema.parse({
      post: POST!,
      url: strArg("url") ?? undefined,
      youtube: strArg("youtube") ?? undefined,
      file: strArg("file") ?? undefined,
      capture: capture
        ? {
            film: capture,
            at: at != null ? Number(at) : undefined,
            from: from ?? undefined,
          }
        : undefined,
      alt: strArg("alt") ?? "",
      credit: strArg("credit") ?? undefined,
      license: strArg("license") ?? undefined,
      licenseUrl: strArg("license-url") ?? undefined,
      sourceUrl: strArg("source-url") ?? undefined,
    }),
  ];
}

async function runJobs(jobs: Job[]): Promise<void> {
  console.log(`Post heroes: ${jobs.length} job(s)${DRY ? " (dry run)" : ""}`);
  let done = 0;
  const failed: string[] = [];

  for (const job of jobs) {
    try {
      const post = await prisma.post.findUnique({
        where: { slug: job.post },
        select: { id: true, slug: true, image: true },
      });
      if (!post) throw new Error("no post with that slug");
      if (post.image && !FORCE) {
        throw new Error("already has a hero — pass --force to replace it");
      }

      const hero = await heroForJob(job);
      const url = await storeHero(post, hero);
      done += 1;
      console.log(`  /blog/${post.slug} ← ${hero.from}\n    ${url}`);
    } catch (e) {
      failed.push(`${job.post}: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  console.log(`\n${done} ${DRY ? "resolved" : "stored"} · ${failed.length} failed`);
  for (const line of failed) console.warn(`  ${line}`);
}

/** One picture's obligations, as the caption fragment they are printed in. */
function creditLine(hero: Hero): string {
  const license = hero.license
    ? hero.licenseUrl
      ? `[${hero.license}](${hero.licenseUrl})`
      : hero.license
    : null;
  const source = hero.sourceUrl ? `[source](${hero.sourceUrl})` : null;
  return [hero.credit, license, source].filter(Boolean).join(" · ");
}

/**
 * One row of pictures: the images in a single paragraph (which the renderer
 * lays side by side when there is more than one), then the credits.
 *
 * Two pictures by the same photographer under the same licence share one
 * credit with both source links, because printing an identical line twice is
 * noise — the obligation is that every picture's terms are on the page, not
 * that they are repeated.
 */
function imageRow(shots: { url: string; hero: Hero }[]): string {
  const pictures = shots
    .map(({ url, hero }) => `![${hero.alt.replace(/[[\]]/g, "")}](${url})`)
    .join("\n");

  const sameHand =
    shots.length > 1 &&
    shots.every(
      ({ hero }) => hero.credit === shots[0].hero.credit && hero.license === shots[0].hero.license,
    );

  let caption: string;
  if (sameHand) {
    const { hero } = shots[0];
    const license = hero.license
      ? hero.licenseUrl
        ? `[${hero.license}](${hero.licenseUrl})`
        : hero.license
      : null;
    const sources = shots
      .filter(({ hero: h }) => h.sourceUrl)
      .map(({ hero: h }, i) => `[source ${i + 1}](${h.sourceUrl})`)
      .join(", ");
    caption = [hero.credit, license, sources].filter(Boolean).join(" · ");
  } else {
    caption = shots.map(({ hero }) => creditLine(hero)).filter(Boolean).join("; ");
  }

  const label = shots.length > 1 ? "Photos" : "Photo";
  return pictures + (caption ? `\n\n*${label}: ${caption}*` : "");
}

/**
 * Weave the finished blocks into the piece.
 *
 * A block with an `at` goes immediately above that `##` heading, so a picture
 * lands on a section boundary — where a magazine puts one — rather than in
 * the middle of an argument. Blocks with no `at` are appended, under
 * `--heading` when one was given. An `at` that matches no heading is an
 * error rather than a silent append: a picture in the wrong place is worse
 * than a run that stops and says so.
 */
function placeBlocks(
  content: string,
  placed: { at: string | null; block: string }[],
  trailingHeading: string | null,
): string {
  const lines = content.split("\n");
  const headingAt = (text: string) =>
    lines.findIndex((l) => l.startsWith("## ") && l.slice(3).trim() === text.trim());

  // Insert from the bottom up so earlier indices stay valid.
  const inline = placed.filter((p) => p.at) as { at: string; block: string }[];
  const targets = inline.map((p) => {
    const index = headingAt(p.at);
    if (index < 0) {
      throw new Error(
        `no "## ${p.at}" heading in this post — check the heading text, it must match exactly`,
      );
    }
    return { index, block: p.block };
  });
  for (const { index, block } of [...targets].sort((a, b) => b.index - a.index)) {
    lines.splice(index, 0, block, "");
  }

  const tail = placed.filter((p) => !p.at).map((p) => p.block);
  const body = lines.join("\n").trimEnd();
  if (tail.length === 0) return `${body}\n`;
  const addition = (trailingHeading ? [`## ${trailingHeading}`] : []).concat(tail).join("\n\n");
  return `${body}\n\n${addition}\n`;
}

/**
 * Body work: the same jobs, but the destination is the markdown, not the hero
 * columns. Everything for one post is resolved before anything is written —
 * so a failed job aborts its whole post rather than leaving half a gallery.
 */
async function runBody(jobs: BodyJob[]): Promise<void> {
  const heading = strArg("heading");
  const byPost = new Map<string, BodyJob[]>();
  for (const job of jobs) {
    const list = byPost.get(job.post) ?? [];
    list.push(job);
    byPost.set(job.post, list);
  }

  console.log(`Post bodies: ${jobs.length} block(s) into ${byPost.size} post(s)${DRY ? " (dry run)" : ""}`);
  let done = 0;
  const failed: string[] = [];

  for (const [slug, list] of byPost) {
    try {
      const post = await prisma.post.findUnique({
        where: { slug },
        select: { id: true, slug: true, content: true },
      });
      if (!post) throw new Error("no post with that slug");

      // Every destination is checked before a single byte is fetched. It used
      // to be checked in `placeBlocks`, which runs after the uploads — so one
      // mistyped heading put N objects in the bucket and then threw, against
      // this function's own promise to resolve everything before writing.
      const headings = new Set(
        [...post.content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim()),
      );
      for (const at of new Set(list.map((j) => j.at).filter(Boolean) as string[])) {
        if (!headings.has(at)) {
          throw new Error(
            `no "## ${at}" heading in this post — it must match exactly. ` +
              `Headings here: ${[...headings].map((h) => `"${h}"`).join(", ") || "none"}`,
          );
        }
      }

      // Grouped by destination, in the order the file gives them: jobs with
      // the same `at` become one row, jobs with none go to the end.
      const groups: { at: string | null; jobs: BodyJob[] }[] = [];
      for (const job of list) {
        const key = job.at ?? null;
        const last = groups.at(-1);
        if (last && last.at === key && key !== null) last.jobs.push(job);
        else groups.push({ at: key, jobs: [job] });
      }

      const placed: { at: string | null; block: string }[] = [];
      for (const group of groups) {
        const shots: { url: string; hero: Hero }[] = [];
        for (const job of group.jobs) {
          if (job.embed) {
            // The bare URL is the embed syntax: the renderer swaps a paragraph
            // that is only a pasted URL for the platform's click-to-load frame.
            if (job.youtube) {
              const id = youtubeVideoId(job.youtube);
              if (!id) throw new Error(`not a YouTube video URL: ${job.youtube}`);
              placed.push({ at: group.at, block: youtubeWatchUrl(id) });
              continue;
            }
            if (!xStatusId(job.url!) && !instagramEmbedUrl(job.url!)) {
              throw new Error(`not an embeddable post URL (X status or Instagram post): ${job.url}`);
            }
            placed.push({ at: group.at, block: job.url! });
            continue;
          }
          const hero = await heroForJob(job);
          if (hero.license && !hero.sourceUrl) {
            throw new Error("a licence without its source is refused — supply sourceUrl alongside license");
          }
          const processed = await processImage(hero.buf!, { fullWidth: 1600 });
          const url = DRY
            ? `(dry ${processed.width}×${processed.height})`
            : await putPublicObject(
                buildKey("posts", processed.ext),
                processed.full.data,
                processed.contentType,
              );
          shots.push({ url, hero });
        }
        if (shots.length > 0) placed.push({ at: group.at, block: imageRow(shots) });
      }

      const content = placeBlocks(post.content, placed, heading);
      if (!DRY) {
        await prisma.post.update({ where: { id: post.id }, data: { content } });
      }
      done += 1;
      const inline = placed.filter((p) => p.at).length;
      console.log(
        `  /blog/${post.slug} ← ${placed.length} block(s)` +
          `${inline > 0 ? `, ${inline} placed inline` : " appended"}${DRY ? " (dry)" : ""}`,
      );
    } catch (e) {
      failed.push(`${slug}: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  console.log(`\n${done} post(s) ${DRY ? "resolved" : "updated"} · ${failed.length} failed`);
  for (const line of failed) console.warn(`  ${line}`);
}

async function runAuto(): Promise<void> {
  const posts = await prisma.post.findMany({
    where: { image: null },
    orderBy: { createdAt: "desc" },
    take: LIMIT,
    select: {
      id: true,
      slug: true,
      title: true,
      sources: true,
      people: {
        orderBy: { sort: "asc" },
        select: {
          person: {
            select: {
              name: true,
              image: true,
              imageCredit: true,
              imageLicense: true,
              imageLicenseUrl: true,
              imageSourceUrl: true,
              wikidataId: true,
              wikipediaUrl: true,
            },
          },
        },
      },
      movies: {
        orderBy: { sort: "asc" },
        select: {
          movie: {
            select: {
              title: true,
              releaseDate: true,
              image: true,
              imageCredit: true,
              imageLicense: true,
              imageLicenseUrl: true,
              imageSourceUrl: true,
            },
          },
        },
      },
    },
  });

  console.log(
    `Post heroes: ${posts.length} image-less post(s), licensed sources` +
      `${YT_IN_AUTO ? " + cited YouTube thumbnails" : ""}${DRY ? " (dry run)" : ""}`,
  );
  if (posts.length === 0) return;

  let stored = 0;
  let bare = 0;
  const failed: string[] = [];

  for (const post of posts) {
    try {
      const hero = await autoHero(post);
      if (!hero) {
        // Most often: a post whose subjects have no free photograph. That is
        // the licence working, not a failure — the page is fine without one.
        bare += 1;
      } else {
        const url = await storeHero(post, hero);
        stored += 1;
        console.log(`  /blog/${post.slug} ← ${hero.from}\n    ${url}`);
      }
    } catch (e) {
      failed.push(`${post.slug}: ${(e as Error).message.slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, PACE));
  }

  console.log(`\n${stored} ${DRY ? "resolved" : "stored"} · ${bare} with nothing usable · ${failed.length} failed`);
  for (const line of failed) console.warn(`  ${line}`);
}

async function main() {
  if (RESET) {
    if (!POST) throw new Error("--reset-images needs --post=<slug>");
    const post = await prisma.post.findUnique({
      where: { slug: POST },
      select: { id: true, slug: true, content: true, image: true },
    });
    if (!post) throw new Error("no post with that slug");

    // Pictures, their credits, and the embeds a `"embed": true` job wrote —
    // a reset that left a stray video behind reported itself as clean.
    const isEmbed = (l: string) =>
      Boolean(youtubeVideoId(l.trim()) || xStatusId(l.trim()) || instagramEmbedUrl(l.trim()));
    const kept = post.content
      .split("\n")
      .filter((l) => !l.startsWith("![") && !l.startsWith("*Photo") && !isEmbed(l))
      .join("\n")
      // A `--heading` section with everything under it removed is a promise of
      // pictures that are no longer there.
      .replace(/^##[^\n]*\n+(?=##|\s*$)/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const removed = (post.content.match(/!\[/g) ?? []).length;
    const embeds = post.content.split("\n").filter(isEmbed).length;

    if (!DRY) {
      await prisma.post.update({
        where: { id: post.id },
        data: {
          content: `${kept}\n`,
          // All six together: Post_imageAlt_needs_image and its twin refuse a
          // caption with no picture under it.
          image: null,
          imageAlt: null,
          imageCredit: null,
          imageLicense: null,
          imageLicenseUrl: null,
          imageSourceUrl: null,
        },
      });
    }
    console.log(
      `/blog/${post.slug}: ${removed} picture(s) and ${embeds} embed(s) removed, ` +
        `hero ${post.image ? "cleared" : "was already empty"}${DRY ? " (dry)" : ""}\n` +
        "Objects are left in the bucket on purpose.",
    );
    return;
  }

  if (!AUTO && !IMAGES && !BODY && !POST) {
    throw new Error(
      "nothing to do: pass --auto, --images=<file.json>, --body=<file.json>, or " +
        "--post=<slug> with a source (see the header of this file)",
    );
  }
  // Mistakes that would otherwise be silently half-obeyed.
  if (AUTO && strArg("youtube")) {
    throw new Error(
      "--auto takes the bare --youtube flag (allow thumbnails of videos cited in `sources`); " +
        "to use one specific video, target the post: --post=<slug> --youtube=<url> --alt=…",
    );
  }
  if (IMAGES && POST) {
    throw new Error("--images and --post are two ways to say the same thing — pass one");
  }
  if (BODY && (IMAGES || POST)) {
    throw new Error("--body is its own run — heroes and body blocks want separate invocations");
  }

  if (AUTO) {
    await runAuto();
    return;
  }
  if (BODY) {
    await runBody(z.array(bodyJobSchema).min(1).parse(JSON.parse(readFileSync(BODY, "utf8"))));
    return;
  }
  const jobs = IMAGES
    ? z.array(jobSchema).min(1).parse(JSON.parse(readFileSync(IMAGES, "utf8")))
    : jobsFromFlags();
  await runJobs(jobs);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
