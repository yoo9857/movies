/**
 * Where a post's hero image may come from, as pure functions.
 *
 * The fetching lives in `scripts/fill-post-images.ts`; what lives here is the
 * parsing — YouTube's several URL shapes, the image a page nominates for
 * itself, the Instagram check — because parsing is the part that breaks
 * quietly when a host changes its markup, and therefore the part the unit
 * suite pins.
 */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** The eleven-character video id, from any of the URL shapes YouTube mints. */
export function youtubeVideoId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return YT_ID.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (v && YT_ID.test(v)) return v;
    const m = /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:[/?]|$)/.exec(u.pathname);
    return m ? m[1] : null;
  }
  return null;
}

/** The canonical form — what `imageSourceUrl` should print. */
export const youtubeWatchUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`;

/**
 * Thumbnail candidates, best first. `maxresdefault` is a 404 for videos
 * YouTube never rendered one for (most pre-2017 uploads), so the caller walks
 * the list; `hqdefault` exists for everything that exists at all.
 */
export function youtubeThumbnailUrls(id: string): string[] {
  return [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ];
}

/**
 * An X status id, from any of the hosts the platform has answered to.
 *
 * This is the *embed* path — the one X sanctions. The id feeds
 * `platform.twitter.com/embed/Tweet.html?id=…`, so the post renders from X's
 * own servers with its author attached; nothing is copied to ours.
 */
export function xStatusId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|mobile)\./, "");
  if (host !== "twitter.com" && host !== "x.com") return null;
  const m = /^\/[A-Za-z0-9_]{1,20}\/status(?:es)?\/(\d{4,25})(?:[/?]|$)/.exec(u.pathname + "/");
  return m ? m[1] : null;
}

/**
 * The official embed URL for an Instagram post/reel, or null.
 *
 * Same stance as X: `<post>/embed` is Instagram serving its own content into
 * a frame it offers for exactly this. Copying the photograph out of it stays
 * refused — that is the difference between showing a post and taking one.
 */
export function instagramEmbedUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "instagram.com" && host !== "instagr.am") return null;
  const m = /^\/(p|reel|tv)\/([A-Za-z0-9_-]{5,40})(?:[/?]|$)/.exec(u.pathname + "/");
  return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed` : null;
}

/**
 * Refused by name, not discovered by failure: an anonymous fetch of an
 * Instagram post gets a login wall, and nothing there is licensed for reuse —
 * so the answer has to be a sentence about permission, not a sharp decode
 * error about the login page's HTML. (Embedding a post is the sanctioned
 * opposite — see `instagramEmbedUrl`.)
 */
export function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am";
  } catch {
    return false;
  }
}

/**
 * The day a Commons photograph was taken, from its `DateTimeOriginal`.
 *
 * The field is free text wrapped in whatever HTML the uploader's template
 * emitted: "2025-10-15", "<time class=…>15 October 2025</time>", "2013:07:14
 * 19:02:11" (EXIF colons), sometimes just a year. Anything that yields a
 * parseable day (or at least a year) comes back as "YYYY-MM-DD" / "YYYY-01-01"
 * so callers can sort newest-first; garbage comes back null and the caller
 * falls back to the upload timestamp.
 */
export function commonsCaptureDay(raw: string | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // ISO-ish and EXIF forms: 2025-10-15, 2013:07:14 19:02:11
  const iso = /\b(\d{4})[-:](\d{2})[-:](\d{2})\b/.exec(text);
  if (iso) {
    const [, y, m, d] = iso;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  // Written out: "15 October 2025" or "October 15, 2025"
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const dmy = /\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/.exec(text);
  const mdy = /\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/.exec(text);
  const [dayStr, monthName, yearStr] = dmy
    ? [dmy[1], dmy[2], dmy[3]]
    : mdy
      ? [mdy[2], mdy[1], mdy[3]]
      : [null, null, null];
  if (dayStr && monthName && yearStr) {
    const month = months.indexOf(monthName.toLowerCase()) + 1;
    const day = Number(dayStr);
    if (month >= 1 && day >= 1 && day <= 31) {
      return `${yearStr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // A bare year still sorts.
  const year = /\b(19\d{2}|20\d{2})\b/.exec(text);
  return year ? `${year[1]}-01-01` : null;
}

/** Priority order: the secure og:image first, twitter's copy last. */
const LEAD_IMAGE_KEYS = [
  "og:image:secure_url",
  "og:image",
  "twitter:image",
  "twitter:image:src",
] as const;

/**
 * The image a page nominates for itself — og:image and its twitter twin.
 *
 * Parsed attribute-by-attribute rather than with one big regex because the
 * order is not guaranteed: half the news CMSes emit `content` before
 * `property`. A relative value is resolved against the page, and a bare http
 * URL is upgraded — the import path refuses plaintext, and every host that
 * still writes `http://` into og:image serves the same file over https.
 */
export function pageLeadImage(html: string, baseUrl: string): string | null {
  const found = new Map<string, string>();
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    const attr = (name: string): string | null => {
      const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
      return m ? ((m[2] ?? m[3]) || null) : null;
    };
    const key = (attr("property") ?? attr("name"))?.toLowerCase();
    const content = attr("content");
    if (!key || !content) continue;
    if ((LEAD_IMAGE_KEYS as readonly string[]).includes(key) && !found.has(key)) {
      found.set(key, content);
    }
  }

  for (const key of LEAD_IMAGE_KEYS) {
    const raw = found.get(key);
    if (!raw) continue;
    const value = raw
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .trim();
    try {
      const resolved = new URL(value, baseUrl);
      if (resolved.protocol === "http:") resolved.protocol = "https:";
      if (resolved.protocol === "https:") return resolved.href;
    } catch {
      // malformed content on this key — the next key may still be usable
    }
  }
  return null;
}
