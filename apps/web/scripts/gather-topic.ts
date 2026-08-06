// A topic, thrown at the desk: the latest coverage and the latest licensed
// pictures, gathered into the two job files the publishing pipeline eats.
//
//   cd apps/web && npx tsx scripts/gather-topic.ts --topic="BTS reunion" \
//     --category=ISSUE --out-sources=sources.json
//   npm run topic -- --topic="…" …                        # from the repo root
//
// Options:
//   --topic="…"           what the piece is about (required)
//   --image-query="…"     what the pictures should match, when the story's
//                         phrasing isn't a photograph's (default: the topic)
//   --news=N              newest articles to cite (default 6)
//   --images=N            newest licensed photographs to pick (default 8)
//   --category=…          PEOPLE | ISSUE | INDUSTRY | CRAFT | WATCHLIST (default ISSUE)
//   --people=a,b --films=c,d   subject slugs carried into the sources job
//   --youtube=<video url> verify via oEmbed; cited as a source and, with
//                         --out-body, prepended as an embed job
//   --out-sources=<file>  a db:write-posts --sources job (one job, this topic)
//   --post=<slug> --out-body=<file>   a post-images --body jobs file
//
// The flow is two-phase on purpose: gather → write-posts lands the draft (and
// mints the slug) → gather again with --post/--out-body, or reuse the printed
// image list. The tool finds; a person vouches — `brief` is deliberately never
// auto-filled, because write-posts trusts it as operator-checked fact.
//
// What it will not do: X and Instagram. Both wall off anonymous reads, and
// nothing on either carries a licence this site could print — so there is
// nothing there to "gather", only things to take. A photograph the desk has
// actual permission for comes in by hand: post-images --file with the post
// URL as --source-url. YouTube is different only in that a *thumbnail* is an
// operator's editorial call and an *embed* plays from YouTube itself.
//
// Sources of record:
//   · news — Bing News RSS (keyless, direct publisher links), newest first.
//     Korean portals in the results will still refuse write-posts' fetch;
//     the headline list printed here is what the operator pastes a brief from.
//   · images — Commons search (relevance) re-sorted newest-first by capture
//     day, licensed files only, at most two frames per event, credit and
//     licence carried on every job; Openverse (CC-licensed Flickr and
//     friends, keyless) tops up whatever Commons falls short of. The licence
//     filter is the point: a picture this cannot take is a picture the site
//     may not print — attribution alone is not a licence.
import { writeFileSync } from "node:fs";
import { commonsCaptureDay, youtubeVideoId, youtubeWatchUrl } from "@/lib/post-image-sources";

function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const TOPIC = strArg("topic");
/**
 * Commons is indexed by what a photo *is*, not what a story is about — a
 * "BTS reunion" piece wants photographs matching "BTS". Defaults to the topic.
 */
const IMAGE_QUERY = strArg("image-query");
const NEWS = Number(strArg("news")) || 6;
const IMAGES = Number(strArg("images")) || 8;
const CATEGORY = strArg("category") ?? "ISSUE";
const PEOPLE = (strArg("people") ?? "").split(",").filter(Boolean);
const FILMS = (strArg("films") ?? "").split(",").filter(Boolean);
const YOUTUBE = strArg("youtube");
const OUT_SOURCES = strArg("out-sources");
const OUT_BODY = strArg("out-body");
const POST = strArg("post");

const UA = "CinePixo/1.0 (https://cinepixo.com) film-criticism site";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const PER_EVENT = 2;
/**
 * Ask Commons for a bounded rendition rather than the file itself.
 *
 * Same rule the video importers follow: take the transcode, not the archival
 * master. A press-agency original can be tens of megabytes, which the ingest
 * pipeline refuses at 20 MB — and the hero is re-encoded to 1600px regardless,
 * so the extra pixels were never going to reach a reader.
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

const unentity = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

function plain(value: string | undefined): string | null {
  if (!value) return null;
  const t = unentity(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return t || null;
}

/* ── The latest coverage ─────────────────────────────────────── */

interface Article {
  title: string;
  url: string;
  date: string;
  host: string;
}

/** Bing wraps some links in its own redirect; the real URL rides in ?url=. */
function unwrapRedirect(url: string): string {
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

async function latestNews(topic: string): Promise<Article[]> {
  // en-US market pinned: without it Bing guesses a locale, and "BTS" in the
  // French market is a diploma, not a band.
  const rss = await text(
    `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss&setmkt=en-US&setlang=en-US`,
  );
  if (!rss) return [];
  const items = rss.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const articles: Article[] = [];
  for (const item of items) {
    const pick = (tag: string): string | undefined => {
      const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(item);
      if (!m) return undefined;
      const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(m[1]);
      return cdata ? cdata[1] : m[1];
    };
    const title = plain(pick("title") ?? undefined);
    const url = unwrapRedirect(unentity(pick("link") ?? "").trim());
    const pub = pick("pubDate");
    if (!title || !/^https?:\/\//.test(url)) continue;
    const when = pub ? new Date(pub) : null;
    articles.push({
      title,
      url,
      date: when && !Number.isNaN(when.getTime()) ? when.toISOString().slice(0, 10) : "1970-01-01",
      host: new URL(url).hostname.replace(/^www\./, ""),
    });
  }
  // One article per outlet, newest first — six links to one syndicate is one source.
  const seen = new Set<string>();
  return articles
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((a) => (seen.has(a.host) ? false : (seen.add(a.host), true)))
    .slice(0, NEWS);
}

/* ── The latest licensed pictures ────────────────────────────── */

interface Photo {
  title: string;
  url: string;
  day: string;
  credit: string | null;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string;
}

const eventKey = (title: string) => title.replace(/[\s_]*(\(\d+\)|\d+)$/, "").toLowerCase();

/**
 * Openverse: the CC-licensed slice of Flickr and friends, keyless.
 *
 * A second pool for the same rule — only material whose licence we can print.
 * It tops up what Commons lacks rather than leading, because Commons carries
 * capture dates (so "newest" means something) and its licence reviews are
 * stricter; Flickr-side licence laundering (a fan reposting an agency photo
 * as CC) exists, which is one more reason the jobs file is a review step,
 * not a publish step.
 */
async function openversePhotos(query: string, want: number): Promise<Photo[]> {
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
  const photos: Photo[] = [];
  for (const r of data?.results ?? []) {
    if (!r.url || !r.foreign_landing_url || !r.license || !r.license_url) continue;
    if ((r.width ?? 0) < 700) continue;
    if (!/^https:\/\//.test(r.url)) continue;
    photos.push({
      title: (r.title ?? "untitled").slice(0, 200),
      url: r.url,
      day: (r.indexed_on ?? "1970-01-01").slice(0, 10),
      credit: r.creator ?? null,
      license: `CC ${r.license.toUpperCase()}${r.license_version ? ` ${r.license_version}` : ""}`,
      licenseUrl: r.license_url,
      sourceUrl: r.foreign_landing_url,
    });
  }
  return photos.slice(0, want);
}

async function latestPhotos(topic: string): Promise<Photo[]> {
  const search = await json<{ query?: { search?: { title: string }[] } }>(
    `${COMMONS}?action=query&list=search&srnamespace=6&srsearch=${encodeURIComponent(topic)}` +
      "&srlimit=50&format=json&origin=*",
  );
  const titles = (search?.query?.search ?? [])
    .map((s) => s.title)
    .filter((t) => /\.(jpe?g|png)$/i.test(t));
  if (titles.length === 0) return [];

  interface Info {
    url?: string;
    /** The `iiurlwidth` rendition — see RENDITION_WIDTH. */
    thumburl?: string;
    descriptionurl?: string;
    width?: number;
    timestamp?: string;
    extmetadata?: Record<string, { value?: string }>;
  }
  const photos: Photo[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const data = await json<{ query?: { pages?: Record<string, { title?: string; imageinfo?: Info[] }> } }>(
      `${COMMONS}?action=query&titles=${encodeURIComponent(titles.slice(i, i + 50).join("|"))}` +
        `&prop=imageinfo&iiprop=url|extmetadata|size|timestamp&iiurlwidth=${RENDITION_WIDTH}` +
        "&format=json&origin=*",
    );
    for (const page of Object.values(data?.query?.pages ?? {})) {
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata ?? {};
      const license = plain(meta.LicenseShortName?.value);
      const title = (page.title ?? "").replace(/^File:/, "").replace(/\.[a-z]+$/i, "");
      if (!info?.url || !info.descriptionurl || !license) continue;
      if ((info.width ?? 0) < 700) continue;
      if (/logo|signature|autograph|poster|album|cover|map|diagram/i.test(title)) continue;
      photos.push({
        title,
        // The rendition, never the archival master: a Commons original can be
        // 40 MB of scan the ingest pipeline refuses outright, and everything
        // here is re-encoded to 1600px wide anyway.
        url: info.thumburl ?? info.url,
        day: commonsCaptureDay(meta.DateTimeOriginal?.value) ?? (info.timestamp ?? "1970-01-01").slice(0, 10),
        credit: plain(meta.Artist?.value) ?? plain(meta.Credit?.value),
        license,
        licenseUrl: plain(meta.LicenseUrl?.value),
        sourceUrl: info.descriptionurl,
      });
    }
  }

  const perEvent = new Map<string, number>();
  const picked: Photo[] = [];
  for (const p of photos.sort((a, b) => b.day.localeCompare(a.day))) {
    const key = eventKey(p.title);
    const n = perEvent.get(key) ?? 0;
    if (n >= PER_EVENT) continue;
    perEvent.set(key, n + 1);
    picked.push(p);
    if (picked.length >= IMAGES) break;
  }
  return picked;
}

/* ── Main ────────────────────────────────────────────────────── */

async function main() {
  if (!TOPIC) throw new Error('pass --topic="…" (see the header of this file)');

  let video: { watch: string; title: string | null } | null = null;
  if (YOUTUBE) {
    const id = youtubeVideoId(YOUTUBE);
    if (!id) throw new Error(`not a YouTube video URL: ${YOUTUBE}`);
    const meta = await json<{ title?: string }>(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeWatchUrl(id))}&format=json`,
    );
    if (!meta) throw new Error(`YouTube does not answer for ${id}`);
    video = { watch: youtubeWatchUrl(id), title: meta.title ?? null };
  }

  const [news, commons] = await Promise.all([
    latestNews(TOPIC),
    latestPhotos(IMAGE_QUERY ?? TOPIC),
  ]);
  // Commons leads (dated, stricter reviews); Openverse tops up the shortfall.
  const extra = await openversePhotos(IMAGE_QUERY ?? TOPIC, IMAGES - commons.length);
  const photos = [...commons, ...extra];

  console.log(`\n"${TOPIC}" — ${news.length} article(s), newest first:`);
  for (const a of news) console.log(`  ${a.date}  ${a.host}  ${a.title}`);
  if (video) console.log(`  video: ${video.title ?? video.watch}`);

  console.log(`\n${photos.length} licensed photograph(s), newest first:`);
  if (photos.length === 0) {
    console.log(`  none matched "${IMAGE_QUERY ?? TOPIC}" — try --image-query= with the subject's plain name`);
  }
  for (const p of photos) console.log(`  ${p.day}  ${p.title} — ${p.license} — ${p.credit ?? "no credit"}`);
  console.log(
    "\nNot gathered: X and Instagram photographs (anonymous reads are walled, nothing there" +
      " is licensed for reuse). Their *posts* embed instead: paste the post URL on its own" +
      ' line, or a --body job with "embed": true and the URL. Permission-in-hand files:' +
      " post-images --file=… --source-url=<the post>.",
  );

  if (OUT_SOURCES) {
    const job = [
      {
        sources: [...news.map((a) => a.url), ...(video ? [video.watch] : [])],
        category: CATEGORY,
        angle: TOPIC,
        people: PEOPLE,
        films: FILMS,
      },
    ];
    writeFileSync(OUT_SOURCES, JSON.stringify(job, null, 2));
    console.log(
      `\nwrote the sources job to ${OUT_SOURCES} — review it, add a brief if the outlets` +
        ` refuse fetches, then: npm run db:write-posts -- --sources=${OUT_SOURCES}`,
    );
  }

  if (OUT_BODY) {
    if (!POST) throw new Error("--out-body needs --post=<post slug> to aim the jobs at");
    const jobs = [
      ...(video ? [{ post: POST, youtube: video.watch, embed: true }] : []),
      ...photos.map((p) => ({
        post: POST,
        url: p.url,
        alt: p.title.replace(/_/g, " "),
        ...(p.credit ? { credit: p.credit } : {}),
        license: p.license,
        ...(p.licenseUrl ? { licenseUrl: p.licenseUrl } : {}),
        sourceUrl: p.sourceUrl,
      })),
    ];
    writeFileSync(OUT_BODY, JSON.stringify(jobs, null, 2));
    console.log(`wrote ${jobs.length} body job(s) to ${OUT_BODY} — run: npm run post-images -- --body=${OUT_BODY}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
