/**
 * Where a piece's raw material comes from: the latest coverage, and the
 * latest pictures whose licence we are allowed to print.
 *
 * Extracted from the gather script so the one-command pipeline and the
 * gather-only script are the same code. Everything here is keyless and
 * anonymous — Bing's news RSS, the Commons API, Openverse — and every failure
 * returns empty rather than throwing, because a gather that finds less is a
 * thinner piece, not a crashed run.
 *
 * The one rule that is not negotiable: **a photograph with no licence is not
 * a candidate.** Attribution is not a licence, and `Post_image_license_has_source`
 * will refuse the row anyway.
 */
import { commonsCaptureDay } from "@/lib/post-image-sources";

const UA = "CinePixo/1.0 (https://cinepixo.com) film-criticism site";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
/** At most this many frames of one event — eight of one red carpet is not a gallery. */
const PER_EVENT = 2;
/**
 * Ask Commons for a bounded rendition rather than the file itself — the rule
 * the video importers follow (take the transcode, not the archival master).
 * Originals here run past 20 MB, which the ingest pipeline refuses, and every
 * picture is re-encoded to 1600px wide regardless.
 */
const RENDITION_WIDTH = 2000;

async function text(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export const unentity = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const plain = (value: string | undefined): string | null => {
  if (!value) return null;
  const t = unentity(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return t || null;
};

/* ── The latest coverage ─────────────────────────────────────── */

export interface Article {
  title: string;
  url: string;
  /** ISO day, or "1970-01-01" when the feed gave nothing usable. */
  date: string;
  host: string;
}

/** Bing wraps some links in its own redirect; the real URL rides in ?url=. */
export function unwrapRedirect(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)bing\.com$/.test(u.hostname)) {
      const real = u.searchParams.get("url");
      if (real && /^https?:\/\//.test(real)) return real;
    }
  } catch {
    // judged by the caller's URL check
  }
  return url;
}

export async function latestNews(topic: string, limit = 6): Promise<Article[]> {
  // en-US pinned: without it Bing guesses a market, and "BTS" in the French
  // one is a diploma rather than a band.
  const rss = await text(
    `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss&setmkt=en-US&setlang=en-US`,
  );
  if (!rss) return [];

  const articles: Article[] = [];
  for (const item of rss.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const pick = (tag: string): string | undefined => {
      const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(item);
      if (!m) return undefined;
      const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(m[1]);
      return cdata ? cdata[1] : m[1];
    };
    const title = plain(pick("title"));
    const url = unwrapRedirect(unentity(pick("link") ?? "").trim());
    if (!title || !/^https?:\/\//.test(url)) continue;
    const when = pick("pubDate") ? new Date(pick("pubDate")!) : null;
    articles.push({
      title,
      url,
      date: when && !Number.isNaN(when.getTime()) ? when.toISOString().slice(0, 10) : "1970-01-01",
      host: new URL(url).hostname.replace(/^www\./, ""),
    });
  }

  // One article per outlet, newest first: six links to one syndicate is one source.
  const seen = new Set<string>();
  return articles
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((a) => (seen.has(a.host) ? false : (seen.add(a.host), true)))
    .slice(0, limit);
}

/* ── The latest licensed pictures ────────────────────────────── */

export interface Photo {
  title: string;
  url: string;
  /** Capture day where the file records one, else the upload day. */
  day: string;
  credit: string | null;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string;
}

/** "V at Festival 2025 03" and "…02" are one event; the key drops the frame number. */
export const eventKey = (title: string): string =>
  title.replace(/[\s_]*(\(\d+\)|\d+)$/, "").toLowerCase();

/** Newest first, at most PER_EVENT frames of any one occasion. */
export function pickPhotos(photos: Photo[], want: number): Photo[] {
  const perEvent = new Map<string, number>();
  const picked: Photo[] = [];
  for (const p of [...photos].sort((a, b) => b.day.localeCompare(a.day))) {
    const key = eventKey(p.title);
    const n = perEvent.get(key) ?? 0;
    if (n >= PER_EVENT) continue;
    perEvent.set(key, n + 1);
    picked.push(p);
    if (picked.length >= want) break;
  }
  return picked;
}

const JUNK = /logo|signature|autograph|poster|album|cover|map|diagram|screenshot/i;

interface CommonsInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  width?: number;
  timestamp?: string;
  extmetadata?: Record<string, { value?: string }>;
}

/** Turn one Commons imageinfo answer into a candidate, or null if unusable. */
function commonsCandidate(rawTitle: string, info: CommonsInfo | undefined): Photo | null {
  const meta = info?.extmetadata ?? {};
  const license = plain(meta.LicenseShortName?.value);
  const title = rawTitle.replace(/^File:/, "").replace(/\.[a-z]+$/i, "");
  if (!info?.url || !info.descriptionurl || !license) return null;
  if ((info.width ?? 0) < 700) return null;
  if (JUNK.test(title)) return null;
  return {
    title,
    // The rendition, never the archival master.
    url: (info.thumburl ?? info.url).split("?")[0],
    day: commonsCaptureDay(meta.DateTimeOriginal?.value) ?? (info.timestamp ?? "1970-01-01").slice(0, 10),
    credit: plain(meta.Artist?.value) ?? plain(meta.Credit?.value),
    license,
    licenseUrl: plain(meta.LicenseUrl?.value),
    sourceUrl: info.descriptionurl,
  };
}

/** Metadata for a batch of file titles. */
async function commonsInfo(titles: string[]): Promise<Photo[]> {
  const out: Photo[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const data = await json<{
      query?: { pages?: Record<string, { title?: string; imageinfo?: CommonsInfo[] }> };
    }>(
      `${COMMONS}?action=query&titles=${encodeURIComponent(titles.slice(i, i + 50).join("|"))}` +
        `&prop=imageinfo&iiprop=url|extmetadata|size|timestamp&iiurlwidth=${RENDITION_WIDTH}` +
        "&format=json&origin=*",
    );
    for (const page of Object.values(data?.query?.pages ?? {})) {
      const candidate = commonsCandidate(page.title ?? "", page.imageinfo?.[0]);
      if (candidate) out.push(candidate);
    }
  }
  return out;
}

/** Commons file search, by what the picture is of. */
export async function commonsPhotos(query: string): Promise<Photo[]> {
  const search = await json<{ query?: { search?: { title: string }[] } }>(
    `${COMMONS}?action=query&list=search&srnamespace=6&srsearch=${encodeURIComponent(query)}` +
      "&srlimit=50&format=json&origin=*",
  );
  const titles = (search?.query?.search ?? [])
    .map((s) => s.title)
    .filter((t) => /\.(jpe?g|png)$/i.test(t));
  return titles.length === 0 ? [] : commonsInfo(titles);
}

/** Every file in a person's Commons category tree, depth-limited. */
export async function commonsCategoryPhotos(category: string, maxDepth = 2, maxFiles = 400): Promise<Photo[]> {
  const members = async (cat: string, type: "file" | "subcat"): Promise<string[]> => {
    const data = await json<{ query?: { categorymembers?: { title: string }[] } }>(
      `${COMMONS}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat)}` +
        `&cmtype=${type}&cmlimit=200&format=json&origin=*`,
    );
    return (data?.query?.categorymembers ?? []).map((m) => m.title);
  };

  const titles: string[] = [];
  const queue: { cat: string; depth: number }[] = [{ cat: `Category:${category}`, depth: 0 }];
  while (queue.length > 0 && titles.length < maxFiles) {
    const { cat, depth } = queue.shift()!;
    for (const t of await members(cat, "file")) {
      if (/\.(jpe?g|png)$/i.test(t)) titles.push(t);
    }
    if (depth < maxDepth) {
      for (const sub of await members(cat, "subcat")) queue.push({ cat: sub, depth: depth + 1 });
    }
  }
  return commonsInfo(titles);
}

/**
 * Openverse: the CC-licensed slice of Flickr and friends, keyless.
 *
 * A second pool under the same rule. It tops up rather than leads, because
 * Commons carries capture dates (so "newest" means something) and reviews its
 * licences harder — Flickr-side licence laundering is real, which is one more
 * reason the jobs file is a review step and not a publish step.
 */
export async function openversePhotos(query: string, want: number): Promise<Photo[]> {
  if (want <= 0) return [];
  const data = await json<{
    results?: {
      title?: string;
      url?: string;
      width?: number;
      creator?: string;
      license?: string;
      license_version?: string;
      license_url?: string;
      foreign_landing_url?: string;
      indexed_on?: string;
    }[];
  }>(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
      "&license_type=all-cc&page_size=50&mature=false&format=json",
  );
  const out: Photo[] = [];
  for (const r of data?.results ?? []) {
    if (!r.url || !r.foreign_landing_url || !r.license || !r.license_url) continue;
    if ((r.width ?? 0) < 700) continue;
    if (!/^https:\/\//.test(r.url)) continue;
    out.push({
      title: (r.title ?? "untitled").slice(0, 200),
      url: r.url,
      day: (r.indexed_on ?? "1970-01-01").slice(0, 10),
      credit: r.creator ?? null,
      license: `CC ${r.license.toUpperCase()}${r.license_version ? ` ${r.license_version}` : ""}`,
      licenseUrl: r.license_url,
      sourceUrl: r.foreign_landing_url,
    });
  }
  return out.slice(0, want);
}

/** Commons leads, Openverse fills the shortfall. */
export async function gatherPhotos(query: string, want: number): Promise<Photo[]> {
  const commons = pickPhotos(await commonsPhotos(query), want);
  if (commons.length >= want) return commons;
  const extra = await openversePhotos(query, want - commons.length);
  return [...commons, ...extra];
}

/* ── Where the pictures go ───────────────────────────────────── */

export interface PhotoPlacement {
  /** The `##` heading this row sits above. */
  at: string;
  /** How many pictures in the row — more than one renders side by side. */
  take: number;
}

/**
 * Spread pictures down a piece instead of stacking them at the end.
 *
 * The rhythm is a repeating pattern of row sizes — 1, 2, 2, 1 by default — laid
 * against the headings after the first, so the piece opens on prose and then
 * alternates a full-width picture with a pair. Whatever will not fit joins the
 * last row rather than being dropped: a photograph that was fetched and then
 * silently discarded is worse than a row of three.
 */
export function photoPlan(
  headings: string[],
  photos: number,
  rhythm: number[] = [1, 2, 2, 1],
): PhotoPlacement[] {
  if (photos <= 0 || headings.length === 0) return [];
  // Leave the opening section clear when there is more than one heading.
  const targets = headings.length > 1 ? headings.slice(1) : headings;

  const plan: PhotoPlacement[] = [];
  let left = photos;
  for (let i = 0; i < targets.length && left > 0; i++) {
    const take = Math.min(rhythm[i % rhythm.length], left);
    plan.push({ at: targets[i], take });
    left -= take;
  }
  if (left > 0 && plan.length > 0) plan[plan.length - 1].take += left;
  return plan;
}
