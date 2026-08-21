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
  /** Of the source file, so a caller can judge how it will hold up. */
  width: number;
  height: number;
  credit: string | null;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string;
  /**
   * What the file says it shows, where it says anything. This is alt text —
   * the caller has nothing else to write one from, and a Commons title is a
   * filename.
   */
  description: string | null;
  /**
   * Who this was gathered as being of, when the gather was subject-led. Only
   * `photoAlt` uses it, and only to decide whether the description identifies
   * anybody.
   */
  subject?: string;
}

/**
 * The sentence a picture's alt text should be.
 *
 * A Commons title is "Catherine Laga'aia (55221039143)" — the subject's name
 * and a Flickr upload id. Written into `imageAlt` it satisfies
 * `Post_image_needs_alt`, which only demands a non-blank string, and tells a
 * screen-reader user nothing: the constraint is there so the piece's subject
 * is named to the reader who most needs it, and a serial number is not that.
 *
 * `ImageDescription` carries the real sentence, usually with the uploader's
 * licence instruction stapled to the end ("Please attribute to Gage Skidmore
 * if used elsewhere") — an instruction to us, not a description of the
 * photograph, and it goes in the credit line anyway. Those sentences are
 * dropped; the title stays as the fallback for a file that describes nothing.
 */
/**
 * A sentence about the *file* rather than about what it shows.
 *
 * Commons derivatives describe themselves. The whole `ImageDescription` of one
 * crop is "A cropped version of File:Johnny Depp (3).jpg" — which names the
 * subject, so `nameMatches` preferred it to the title and it went out as the
 * alt text of a published piece. `Post_image_needs_alt` is satisfied, because
 * it is not blank, and the reader who cannot see the photograph is handed the
 * name of a file. Dropped alongside the licence instructions and for the same
 * reason: true of the file, and not a description of the picture.
 *
 * `news-lane` checks the written alt text for this shape as well. The gather is
 * where it can still be fixed — a piece whose hero is captioned properly is a
 * piece that publishes — and the check downstream is what catches the next way
 * a description turns out to be about the upload.
 */
const ABOUT_THE_FILE = /\bfile:|cropped (?:version|from)|derivative work|\.(?:jpe?g|png|webp|gif)\b/i;

export function photoAlt(
  description: string | null,
  title: string,
  /**
   * Who the picture was gathered as being of. Given it, a description that
   * never names them loses to a title that does — see below.
   */
  subject?: string,
): string {
  const kept = (description ?? "")
    .split(/(?<=[.!?])\s+/)
    .filter(
      (s) =>
        s.trim() &&
        !/please attribute|if used elsewhere|do not (?:use|reuse)|all rights reserved|©/i.test(s) &&
        !ABOUT_THE_FILE.test(s),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = title.replace(/_/g, " ");
  if (!kept) return fallback;
  if (!subject) return kept;

  // A description is only better than the filename when it says who is in the
  // picture. Commons routinely fails that: a photograph of Steve Buscemi is
  // described as `Premiere of "The Only Living Pickpocket in New York"`, and
  // one of John Malkovich simply as "the actor". Both left the reader who
  // needs alt text with a caption naming nobody, while the file title named
  // them plainly. So the title wins whenever it alone identifies the subject.
  if (nameMatches(subject, kept)) return kept;
  return nameMatches(subject, fallback) ? fallback : kept;
}

/**
 * How wide a source has to be before it is worth placing.
 *
 * A body picture renders about 768 CSS pixels across, which a phone at 2×
 * fetches as 1536 — so the old 700px floor let through files that arrived
 * visibly soft and looked, correctly, like a mistake. 1200 is a compromise:
 * strict enough that most placements are crisp, loose enough that a subject
 * whose only recent photographs are press-pool crops is not left with none.
 *
 * `--min-width` lowers it when the alternative is nothing at all — which for a
 * living pop star is a real case, since the sharp pictures are agency-owned
 * and the free ones are whatever a fan could upload.
 */
export const DEFAULT_MIN_WIDTH = 1200;

/**
 * "V at Festival 2025 03" and "…02" are one event; the key drops the frame
 * number — and the crop qualifier, because a re-framing is not a second
 * occasion. Commons names them "X-1764", "X-1764 (cropped)" and "X-1764
 * (cropped over the top)", and only the first of those ended in a digit, so
 * two crops of one photograph counted as two more events and walked straight
 * past `PER_EVENT`: a Moana gather offered the same picture of Dwayne Johnson
 * three times out of six.
 *
 * Applied until it stops changing, since a crop of a numbered frame carries
 * both suffixes and one pass would leave the number behind.
 */
export const eventKey = (title: string): string => {
  let key = title;
  for (;;) {
    const next = key
      .replace(/[\s_]*\(crop(?:ped)?\b[^()]*\)$/i, "")
      .replace(/[\s_]*(\(\d+\)|\d+)$/, "");
    if (next === key) return key.toLowerCase();
    key = next;
  }
};

/**
 * Newest first, at most PER_EVENT frames of any one occasion.
 *
 * `of` narrows to pictures whose title names the subject. Pass it for **search**
 * results, where a text index will happily return the building named after the
 * person — and *not* for a category walk, where an editor has already asserted
 * the subject: the best premiere photographs are titled "Ari, Cynthia y Jon",
 * which contains neither token of her name and is unmistakably her.
 *
 * Within a day, a press or premiere photograph outranks a snapshot: same
 * recency, better picture.
 */
export function pickPhotos(photos: Photo[], want: number, of?: string): Photo[] {
  const eligible = of ? photos.filter((p) => nameMatches(of, p.title)) : photos;

  const ranked = [...eligible].sort((a, b) => {
    const byDay = b.day.localeCompare(a.day);
    if (byDay !== 0) return byDay;
    const rank = (p: Photo) => (PREFERRED.test(p.title) ? 1 : 0);
    return rank(b) - rank(a);
  });

  const perEvent = new Map<string, number>();
  const picked: Photo[] = [];
  for (const p of ranked) {
    const key = eventKey(p.title);
    const n = perEvent.get(key) ?? 0;
    if (n >= PER_EVENT) continue;
    perEvent.set(key, n + 1);
    picked.push(p);
    if (picked.length >= want) break;
  }
  return picked;
}

/**
 * Titles that are not a photograph of the subject.
 *
 * `tussauds` and `wax figure` are here because a Commons category for a famous
 * person reliably contains one, it is often the sharpest file in the category,
 * and a piece about what someone said last week illustrated with a waxwork of
 * them is a small humiliation. Statues and murals fail the same way.
 *
 * The rest — posters, album art, broadcast screencaps — are things a fan
 * uploaded and tagged CC that the uploader had no right to license. A tag is
 * not a licence, and these are the shapes where the tag is most often wrong.
 *
 * The archive clause is newer and was earned. A gather for Martin McDonagh
 * ranked first on "McDonagh, Michael Martin - Born- (BLANK), Naturalized-
 * (BLANK)" — a scanned naturalisation index card for a different man of a
 * similar name, public domain, high resolution, and one step from becoming the
 * hero photograph of a piece about a living director. It passed `nameMatches`
 * because both of his names appear in it, which is what a name index is.
 */
const JUNK =
  /logo|signature|autograph|poster|keyart|album|cover art|dvd|blu-?ray|map|diagram|screenshot|screen ?cap|tussauds|wax figure|waxwork|statue|mural|graffiti|fan ?art/i;

/**
 * Scanned paper, not a photograph of anybody: the genealogical and archival
 * series that fill Commons with high-resolution documents bearing people's
 * names. Matched separately from `JUNK` so the reason a file was refused stays
 * legible, and kept to series names and form language rather than bare words
 * like "record", which would refuse a photograph of a record shop.
 */
const ARCHIVAL =
  /naturaliz|petition for|declaration of intention|passenger list|census|draft card|index card|birth certificate|death certificate|marriage record|headstone|gravestone|find a grave|born-\s*\(|passport application/i;

/** Exported so the filter itself is pinned, not merely the behaviour around it. */
export const looksArchival = (title: string): boolean => ARCHIVAL.test(title);

/**
 * A place that carries the name, rather than the person who was given it.
 *
 * `nameMatches` needs every token and that is usually enough — "Higashino
 * Station" loses on the missing given name. It is not enough when a *toponym*
 * contains both tokens: a gather for the director Denis Villeneuve ranked
 * "Cimetière - Villeneuve-Saint-Denis (FR77)" — a cemetery in a commune of
 * that name, CC BY-SA, high resolution, and one step from being a photograph
 * in a piece about a living film-maker (it reached one, on 2026-08-21).
 *
 * Matched separately from `JUNK` and `ARCHIVAL` so the reason a file was
 * refused stays legible, and kept deliberately narrow: place *types* that are
 * never the setting of a photograph we want, plus the Commons commune code,
 * which is a strong statement that the subject of the file is a location.
 * Not included, because a person is legitimately photographed there: churches,
 * schools, theatres, stations.
 */
const PLACE =
  /cemetery|cimeti[eè]re|cementerio|friedhof|graveyard|columbarium|monument to|memorial to|commemorative plaque|street sign|road sign|\((?:FR|DE|IT|ES|BE|CH|NL|AT|PL)\d{2,3}\)/i;

/** Exported for the same reason as `looksArchival`. */
export const looksLikePlace = (title: string): boolean => PLACE.test(title);

/**
 * Pictures worth reaching for first: a performer at work or in front of press.
 * Scored rather than filtered, so a category with nothing better still yields
 * something.
 */
const PREFERRED = /premiere|red ?carpet|festival|press|photocall|conference|concert|performing|live|award/i;

/**
 * A licence this site is actually able to honour.
 *
 * Two clauses rule material out no matter how well it is attributed:
 *
 *  · **NonCommercial.** The site carries advertising. Even if it did not, "is
 *    a film magazine commercial?" is not a question to answer optimistically
 *    on someone else's behalf.
 *  · **NoDerivatives.** Every picture here is re-encoded to WebP at 1600px and
 *    cropped by the layout. That is a derivative work by any reading, so ND is
 *    incompatible with the pipeline itself, not merely with a use of it.
 *
 * Borrowed from the moneyti project's `commonsLicenseOk`, which had reached
 * the same conclusion. Our gatherers previously accepted anything with a
 * licence *name*, which let both classes through.
 */
export function licenceAllows(license: string): boolean {
  const l = license.toLowerCase();
  if (/\bnc\b|noncommercial|non-commercial/.test(l)) return false;
  if (/\bnd\b|noderiv|no-deriv/.test(l)) return false;
  // Everything we can actually use names itself plainly.
  return /cc0|public domain|\bpd\b|cc by|attribution|no restrictions|share ?alike/.test(l);
}

/**
 * Is this file plausibly *of* the person we asked about?
 *
 * Every token of the name has to appear somewhere in the title. Commons search
 * is a text index over descriptions, so a name query returns the person, the
 * building named after them, and the school that hosted them — moneyti records
 * a search for one novelist coming back with ten correctly-licensed pictures
 * of a railway station of the same name. Tokens under three characters are
 * dropped unless they are Hangul, where two characters is a whole name.
 */
export function nameMatches(name: string, title: string): boolean {
  // NFKD to reach the combining accents, then **NFC to put Hangul back
  // together**: decomposition splits 송 into three jamo that the 가-힣 class
  // below does not match, so without the recomposition every Korean name
  // folded to an empty string and matched nothing.
  const fold = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .normalize("NFC")
      .replace(/[^a-z0-9가-힣\s]/g, " ");
  const haystack = fold(title);
  const tokens = fold(name)
    .split(/\s+/)
    .filter((t) => t.length >= 3 || /[가-힣]/.test(t));
  return tokens.length > 0 && tokens.every((t) => haystack.includes(t));
}

/**
 * A stitched broadcast grid or a banner, by shape alone. 9:16 is spared
 * because a phone-shot portrait is a legitimate picture of a person.
 */
const looksLikeMontage = (w: number, h: number): boolean =>
  w > 0 && h > 0 && (w / h > 3 || h / w > 2.4);

interface CommonsInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  width?: number;
  height?: number;
  timestamp?: string;
  extmetadata?: Record<string, { value?: string }>;
}

/** Turn one Commons imageinfo answer into a candidate, or null if unusable. */
function commonsCandidate(
  rawTitle: string,
  info: CommonsInfo | undefined,
  minWidth: number,
): Photo | null {
  const meta = info?.extmetadata ?? {};
  const license = plain(meta.LicenseShortName?.value);
  const title = rawTitle.replace(/^File:/, "").replace(/\.[a-z]+$/i, "");
  if (!info?.url || !info.descriptionurl || !license) return null;
  if (!licenceAllows(license)) return null;
  if ((info.width ?? 0) < minWidth) return null;
  if (JUNK.test(title) || ARCHIVAL.test(title) || PLACE.test(title)) return null;
  if (looksLikeMontage(info.width ?? 0, info.height ?? 0)) return null;
  return {
    title,
    // The rendition, never the archival master.
    url: (info.thumburl ?? info.url).split("?")[0],
    day: commonsCaptureDay(meta.DateTimeOriginal?.value) ?? (info.timestamp ?? "1970-01-01").slice(0, 10),
    width: info.width ?? 0,
    height: info.height ?? 0,
    credit: plain(meta.Artist?.value) ?? plain(meta.Credit?.value),
    license,
    licenseUrl: plain(meta.LicenseUrl?.value),
    sourceUrl: info.descriptionurl,
    description: plain(meta.ImageDescription?.value),
  };
}

/** Metadata for a batch of file titles. */
async function commonsInfo(titles: string[], minWidth: number): Promise<Photo[]> {
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
      const candidate = commonsCandidate(page.title ?? "", page.imageinfo?.[0], minWidth);
      if (candidate) out.push(candidate);
    }
  }
  return out;
}

/**
 * Commons file search, by what the picture is of.
 *
 * Relevance-ranked, which is not the same as complete: searching a performer's
 * name found none of the premiere photographs that sit in their category, and
 * left a 2026 piece illustrated with 2019. Prefer `commonsCategoryPhotos` when
 * the subject is a person; this is for topics that are not one.
 */
export async function commonsPhotos(query: string, minWidth = DEFAULT_MIN_WIDTH): Promise<Photo[]> {
  const search = await json<{ query?: { search?: { title: string }[] } }>(
    `${COMMONS}?action=query&list=search&srnamespace=6&srsearch=${encodeURIComponent(query)}` +
      "&srlimit=50&format=json&origin=*",
  );
  const titles = (search?.query?.search ?? [])
    .map((s) => s.title)
    .filter((t) => /\.(jpe?g|png)$/i.test(t));
  return titles.length === 0 ? [] : commonsInfo(titles, minWidth);
}

/** Every file in a person's Commons category tree, depth-limited. */
export async function commonsCategoryPhotos(
  category: string,
  maxDepth = 2,
  maxFiles = 400,
  minWidth = DEFAULT_MIN_WIDTH,
): Promise<Photo[]> {
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
  return commonsInfo(titles, minWidth);
}

/**
 * Openverse: the CC-licensed slice of Flickr and friends, keyless.
 *
 * A second pool under the same rule. It tops up rather than leads, because
 * Commons carries capture dates (so "newest" means something) and reviews its
 * licences harder — Flickr-side licence laundering is real, which is one more
 * reason the jobs file is a review step and not a publish step.
 */
export async function openversePhotos(
  query: string,
  want: number,
  minWidth = DEFAULT_MIN_WIDTH,
): Promise<Photo[]> {
  if (want <= 0) return [];
  const data = await json<{
    results?: {
      title?: string;
      url?: string;
      width?: number;
      height?: number;
      creator?: string;
      license?: string;
      license_version?: string;
      license_url?: string;
      foreign_landing_url?: string;
      indexed_on?: string;
    }[];
  }>(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
      // 20 is the ceiling for an anonymous caller. Asking for 50 returned a 400
      // that `json` swallowed into null, so this pool contributed nothing at
      // all from the day it was added until someone checked.
      //
      // `commercial,modification` rather than `all-cc`: the previous filter
      // admitted NC and ND, and this pipeline re-encodes every file, which ND
      // forbids outright. Asking the API for the right slice is cheaper than
      // fetching the wrong one and rejecting it.
      "&license_type=commercial,modification&page_size=20&mature=false&format=json",
  );
  const out: Photo[] = [];
  for (const r of data?.results ?? []) {
    if (!r.url || !r.foreign_landing_url || !r.license || !r.license_url) continue;
    if ((r.width ?? 0) < minWidth) continue;
    if (!/^https:\/\//.test(r.url)) continue;
    const title = (r.title ?? "untitled").slice(0, 200);
    if (JUNK.test(title) || ARCHIVAL.test(title)) continue;
    if (looksLikeMontage(r.width ?? 0, r.height ?? 0)) continue;
    out.push({
      title,
      url: r.url,
      day: (r.indexed_on ?? "1970-01-01").slice(0, 10),
      width: r.width ?? 0,
      height: r.height ?? 0,
      credit: r.creator ?? null,
      license: `CC ${r.license.toUpperCase()}${r.license_version ? ` ${r.license_version}` : ""}`,
      licenseUrl: r.license_url,
      sourceUrl: r.foreign_landing_url,
      // Openverse's index has no description field of its own; the title is
      // all this pool offers, and `photoAlt` falls back to it.
      description: null,
    });
  }
  return out.slice(0, want);
}

/**
 * Commons leads, Openverse fills the shortfall.
 *
 * `subject` is the name every candidate's title must contain — give it when
 * the query is a person, and the pool that comes back is of them rather than
 * merely near them.
 */
export async function gatherPhotos(
  query: string,
  want: number,
  minWidth = DEFAULT_MIN_WIDTH,
  subject?: string,
): Promise<Photo[]> {
  const stamp = (photos: Photo[]) =>
    subject ? photos.map((p) => ({ ...p, subject })) : photos;

  const commons = pickPhotos(await commonsPhotos(query, minWidth), want, subject);
  if (commons.length >= want) return stamp(commons);
  const extra = (await openversePhotos(query, want * 2, minWidth)).filter(
    (p) => !subject || nameMatches(subject, p.title),
  );
  return stamp([...commons, ...extra].slice(0, want));
}

/**
 * Pictures for a piece that is about several people, round-robin.
 *
 * One query cannot fill a page. `PER_EVENT` counts frames of one occasion, and
 * for someone whose entire free archive is a single red carpet — 36 of the 37
 * Commons files of Catherine Laga'aia are one CinemaCon afternoon — that caps
 * the piece at two pictures no matter how many are asked for. The honest way
 * past it is not to raise the cap but to ask about the rest of the story: the
 * actor who watched the audition, the cast she joined.
 *
 * Interleaved rather than concatenated so a row of two is rarely two frames of
 * one person, and deduped on `sourceUrl` because two subjects photographed
 * together return the same file to both queries.
 */
export async function gatherForSubjects(
  subjects: string[],
  want: number,
  minWidth = DEFAULT_MIN_WIDTH,
  /**
   * Told what each subject contributed, because a subject that contributes
   * nothing is invisible otherwise: a name misspelled by one character returns
   * zero, the round-robin quietly fills from everyone else, and the piece runs
   * without a single picture of the person it is about.
   */
  report?: (subject: string, found: number) => void,
): Promise<Photo[]> {
  if (subjects.length === 0 || want <= 0) return [];
  const perSubject = Math.max(2, Math.ceil(want / subjects.length) + 1);
  const pools = await Promise.all(
    subjects.map((s) => gatherPhotos(s, perSubject, minWidth, s)),
  );
  pools.forEach((pool, i) => report?.(subjects[i], pool.length));

  const out: Photo[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < want; i++) {
    let reached = false;
    for (const pool of pools) {
      const p = pool[i];
      if (!p) continue;
      reached = true;
      if (seen.has(p.sourceUrl)) continue;
      seen.add(p.sourceUrl);
      out.push(p);
      if (out.length >= want) break;
    }
    if (!reached) break;
  }
  return out;
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

/**
 * How many pictures this piece can hold before the rhythm breaks.
 *
 * `photoPlan` never drops a photograph — the overflow joins the last row — so
 * handing it twelve pictures for four headings produces 1 / 2 / 2 / 7, which
 * is a stack with extra steps. Gathering asks this first and takes exactly
 * that many, so the page reads 1 / 2 / 2 / 1 as designed.
 */
export function rhythmCapacity(headings: string[], rhythm: number[] = [1, 2, 2, 1]): number {
  if (headings.length === 0) return 0;
  const targets = headings.length > 1 ? headings.slice(1) : headings;
  let total = 0;
  for (let i = 0; i < targets.length; i++) total += rhythm[i % rhythm.length];
  return total;
}
