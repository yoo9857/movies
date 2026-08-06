// Save reference material to YOUR OWN files, for the desk's private use.
//
//   cd apps/web && npx tsx scripts/save-media.ts --url=<post or video URL>
//   npx tsx scripts/save-media.ts --list=urls.txt --dir="D:\keeps"
//
//   --url=<…>    one URL
//   --list=<…>   a text file, one URL per line (# lines are comments)
//   --dir=<…>    where to save (default: ~/Downloads/media-saves)
//   --dry        say what would run and where, fetch nothing
//
// **This is a personal archive, deliberately not part of the site.** It writes
// to a local folder — never the upload pipeline, never the database. Keeping a
// copy of something publicly posted, for your own reference, is the private
// copying the law provides for (저작권법 제30조). Publishing it is a different
// act under a different rule, and the site's own CHECK constraints refuse
// these files unless a real licence arrives with them. Attribution is not a
// licence; that is why the two paths are separate programs.
//
// **It runs the standard tools rather than scraping.** YouTube's poster frame
// comes from the public oEmbed and thumbnail endpoints, which need nothing.
// Everything else is handed to yt-dlp (video) or gallery-dl (post images) —
// the maintained tools for this, which track each platform's changes, respect
// their rate limits, and let you supply your own cookies for your own
// account. A bespoke scraper here would be worse at all three.
//
//   pip install yt-dlp gallery-dl        (or: winget install yt-dlp)
//
// Each save gets a `.json` sidecar — source URL, title, author, fetched date —
// so a file found in the folder a year later still says where it came from,
// which is what makes it usable as a reference at all.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  instagramEmbedUrl,
  xStatusId,
  youtubeThumbnailUrls,
  youtubeVideoId,
  youtubeWatchUrl,
} from "@/lib/post-image-sources";

function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const URL_ARG = strArg("url");
const LIST = strArg("list");
const DIR = strArg("dir") ?? path.join(homedir(), "Downloads", "media-saves");
const DRY = process.argv.includes("--dry");

const UA = "CinePixo/1.0 (https://cinepixo.com) film-criticism site";

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`empty file from ${url}`);
  return buf;
}

const extOf = (url: string, fallback = "jpg") =>
  /\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.exec(url)?.[1].toLowerCase() ?? fallback;

function sidecar(file: string, meta: Record<string, unknown>): void {
  writeFileSync(`${file}.json`, JSON.stringify({ ...meta, savedAt: new Date().toISOString() }, null, 2));
}

/** Is a helper on PATH? Checked once per run, so the advice is specific. */
const have = (cmd: string): boolean => {
  try {
    execFileSync(cmd, ["--version"], { stdio: "ignore", timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
};

/** Hand the URL to a helper, letting its output through to the terminal. */
function delegate(cmd: string, args: string[], url: string, install: string): void {
  if (!have(cmd)) {
    throw new Error(`${cmd} is not installed — ${install}`);
  }
  if (DRY) {
    console.log(`  would run: ${cmd} ${args.join(" ")}`);
    return;
  }
  const run = spawnSync(cmd, args, { stdio: "inherit", timeout: 600_000 });
  if (run.status !== 0) throw new Error(`${cmd} exited ${run.status ?? "on a signal"}`);
  sidecar(path.join(DIR, `${cmd}-${Date.now().toString(36)}`), { source: url, tool: cmd });
}

/* ── YouTube: the poster frame is public and keyless ─────────── */

async function saveYoutube(url: string, id: string): Promise<void> {
  const watch = youtubeWatchUrl(id);
  let meta: { title?: string; author_name?: string } = {};
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) meta = (await res.json()) as typeof meta;
  } catch {
    // a missing title is not worth losing the poster over
  }
  console.log(`  ${meta.title ?? id}${meta.author_name ? ` — ${meta.author_name}` : ""}`);

  if (DRY) {
    console.log(`  would save the poster frame; video → yt-dlp ${watch}`);
    return;
  }

  let bytes: Buffer | null = null;
  let from = "";
  for (const candidate of youtubeThumbnailUrls(id)) {
    try {
      bytes = await fetchBytes(candidate);
      from = candidate;
      break;
    } catch {
      // maxresdefault does not exist for every video
    }
  }
  if (!bytes) throw new Error("no thumbnail answered");

  const file = path.join(DIR, `youtube-${id}.${extOf(from)}`);
  writeFileSync(file, bytes);
  sidecar(file, {
    source: watch,
    title: meta.title ?? null,
    author: meta.author_name ?? null,
    kind: "poster frame",
  });
  console.log(`  saved ${path.basename(file)} (${(bytes.length / 1024).toFixed(0)} KB)`);
  console.log(`  the video itself: yt-dlp "${watch}"`);
}

/* ── Everything else goes to the tool that maintains it ──────── */

async function saveOne(url: string): Promise<void> {
  console.log(url);

  const yt = youtubeVideoId(url);
  if (yt) return saveYoutube(url, yt);

  if (xStatusId(url)) {
    // gallery-dl reads a status's photos; yt-dlp is the one for its video.
    return delegate(
      "gallery-dl",
      ["--dest", DIR, url],
      url,
      'install it with "pip install gallery-dl" (for a video in the post: yt-dlp)',
    );
  }

  if (instagramEmbedUrl(url)) {
    // Your own account's cookies belong in gallery-dl's config, not here:
    //   gallery-dl --cookies-from-browser chrome <url>
    return delegate(
      "gallery-dl",
      ["--dest", DIR, url],
      url,
      'install it with "pip install gallery-dl"; for login-walled posts add ' +
        "--cookies-from-browser chrome to your gallery-dl config",
    );
  }

  throw new Error("not a YouTube video, X status, or Instagram post URL");
}

async function main() {
  const urls = URL_ARG
    ? [URL_ARG]
    : LIST
      ? readFileSync(LIST, "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"))
      : [];
  if (urls.length === 0) {
    throw new Error("pass --url=<…> or --list=<file> (see the header of this file)");
  }

  mkdirSync(DIR, { recursive: true });
  console.log(`Saving to ${DIR} — a personal archive, not the site's storage.`);
  console.log("Publishing any of it needs a licence; the site's constraints will ask.\n");

  let ok = 0;
  const failed: string[] = [];
  for (const url of urls) {
    try {
      await saveOne(url);
      ok += 1;
    } catch (e) {
      failed.push(`${url}: ${(e as Error).message.slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\n${ok} done · ${failed.length} failed`);
  for (const line of failed) console.warn(`  ${line}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
