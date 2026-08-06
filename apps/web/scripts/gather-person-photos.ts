// The newest freely-licensed photographs of a person, from Commons, as a
// --body jobs file for fill-post-images.ts.
//
//   cd apps/web && npx tsx scripts/gather-person-photos.ts \
//     --person=kim-tae-hyung --post=<post slug> --out=jobs.json
//   npm run person-photos -- --person=… --post=… --out=…   # from the repo root
//
// Options:
//   --person=<slug>      resolve the Commons category from our Person row
//                        (wikidataId, else wikipediaUrl → Q-id) via P373
//   --category=<name>    skip resolution, use this Commons category
//   --count=N            photographs to pick (default 8)
//   --post=<slug>        the post the emitted jobs target (required with --out)
//   --embed=<video url>  prepend one `"embed": true` job for this video
//   --out=<file.json>    where to write the jobs; without it, just print
//
// **Newest first is the point.** A Commons category lists alphabetically, which
// for a person means whatever event sorts first — a 2013 fansign, forever. So
// every file's capture date (`DateTimeOriginal`, parsed by `commonsCaptureDay`)
// or upload time is read, and the pick is sorted newest-first, capped at two
// per event (files from one shoot differ by a trailing number, and eight
// near-identical frames of one red carpet is not a gallery).
//
// Only licensed files survive: no LicenseShortName, no pick — the same rule as
// every other Commons import here. The jobs carry credit, licence, licence URL
// and the file page as source, so `--body` renders the obligations with the
// picture.
import "../../../packages/db/prisma/env";
import { writeFileSync } from "node:fs";
import { prisma } from "@cinepixo/db";
import { commonsCaptureDay } from "@/lib/post-image-sources";

function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const PERSON = strArg("person");
const CATEGORY = strArg("category");
const COUNT = Number(strArg("count")) || 8;
const POST = strArg("post");
const EMBED = strArg("embed");
const OUT = strArg("out");

const UA = "CinePixo/1.0 (https://cinepixo.com) film-criticism site";
const WD = "https://www.wikidata.org/w/api.php";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
/** Category tree breadth-first, but never past grandchildren. */
const MAX_DEPTH = 2;
/** Enough files to sort; more is just more API calls. */
const MAX_FILES = 400;
/** Two frames of one event, at most. */
const PER_EVENT = 2;
/**
 * Ask Commons for a bounded rendition rather than the file itself — the same
 * rule the video importers follow (take the transcode, not the archival
 * master). Originals run to tens of megabytes, the ingest pipeline refuses
 * anything over 20 MB, and every image is re-encoded to 1600px anyway.
 */
const RENDITION_WIDTH = 2000;

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function plain(value: string | undefined): string | null {
  if (!value) return null;
  const text = value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return text || null;
}

interface WdEntities {
  entities?: Record<
    string,
    { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> }
  >;
}

/** The person's Commons category (P373), from whatever identity we hold. */
async function resolveCategory(): Promise<string> {
  if (CATEGORY) return CATEGORY;
  if (!PERSON) throw new Error("pass --person=<slug> or --category=<name>");

  const person = await prisma.person.findUnique({
    where: { slug: PERSON },
    select: { name: true, wikidataId: true, wikipediaUrl: true },
  });
  if (!person) throw new Error(`no person with slug ${PERSON}`);

  let qid = person.wikidataId;
  if (!qid && person.wikipediaUrl) {
    const path = new URL(person.wikipediaUrl).pathname;
    const title = path.startsWith("/wiki/") ? path.slice("/wiki/".length) : null;
    if (title) {
      const summary = await json<{ wikibase_item?: string }>(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      );
      qid = summary?.wikibase_item ?? null;
    }
  }
  if (!qid) throw new Error(`${person.name} has no Wikidata identity to resolve a category from`);

  const data = await json<WdEntities>(
    `${WD}?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`,
  );
  const category = data?.entities?.[qid]?.claims?.P373?.[0]?.mainsnak?.datavalue?.value;
  if (typeof category !== "string") {
    throw new Error(`${person.name} (${qid}) has no Commons category (P373) — pass --category=`);
  }
  return category;
}

async function membersOf(cat: string, type: "file" | "subcat"): Promise<string[]> {
  const data = await json<{ query?: { categorymembers?: { title: string }[] } }>(
    `${COMMONS}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat)}` +
      `&cmtype=${type}&cmlimit=200&format=json&origin=*`,
  );
  return (data?.query?.categorymembers ?? []).map((m) => m.title);
}

interface Candidate {
  title: string;
  url: string;
  day: string;
  credit: string | null;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string;
}

/** "V at Festival 2025 03" and "…02" are one event; the key drops the frame number. */
const eventKey = (title: string) => title.replace(/[\s_]*\d+$/, "").toLowerCase();

async function main() {
  const category = await resolveCategory();
  console.log(`Commons category: ${category}`);

  const titles: string[] = [];
  const queue: { cat: string; depth: number }[] = [{ cat: `Category:${category}`, depth: 0 }];
  while (queue.length > 0 && titles.length < MAX_FILES) {
    const { cat, depth } = queue.shift()!;
    for (const t of await membersOf(cat, "file")) {
      if (/\.(jpe?g|png)$/i.test(t)) titles.push(t);
    }
    if (depth < MAX_DEPTH) {
      for (const sub of await membersOf(cat, "subcat")) queue.push({ cat: sub, depth: depth + 1 });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`${titles.length} image files in the category tree`);

  interface Info {
    url?: string;
    /** The `iiurlwidth` rendition — see RENDITION_WIDTH. */
    thumburl?: string;
    descriptionurl?: string;
    width?: number;
    timestamp?: string;
    extmetadata?: Record<string, { value?: string }>;
  }
  const candidates: Candidate[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await json<{
      query?: { pages?: Record<string, { title?: string; imageinfo?: Info[] }> };
    }>(
      `${COMMONS}?action=query&titles=${encodeURIComponent(batch.join("|"))}` +
        `&prop=imageinfo&iiprop=url|extmetadata|size|timestamp&iiurlwidth=${RENDITION_WIDTH}` +
        `&format=json&origin=*`,
    );
    for (const page of Object.values(data?.query?.pages ?? {})) {
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata ?? {};
      const license = plain(meta.LicenseShortName?.value);
      const title = (page.title ?? "").replace(/^File:/, "").replace(/\.[a-z]+$/i, "");
      if (!info?.url || !info.descriptionurl || !license) continue;
      if ((info.width ?? 0) < 700) continue;
      if (/logo|signature|autograph|poster|album|cover/i.test(title)) continue;
      candidates.push({
        title,
        // The rendition, never the archival master — see RENDITION_WIDTH.
        url: info.thumburl ?? info.url,
        day:
          commonsCaptureDay(meta.DateTimeOriginal?.value) ??
          (info.timestamp ?? "1970-01-01").slice(0, 10),
        credit: plain(meta.Artist?.value) ?? plain(meta.Credit?.value),
        license,
        licenseUrl: plain(meta.LicenseUrl?.value),
        sourceUrl: info.descriptionurl,
      });
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`${candidates.length} licensed candidates`);

  const perEvent = new Map<string, number>();
  const picked: Candidate[] = [];
  for (const c of candidates.sort((a, b) => b.day.localeCompare(a.day))) {
    const key = eventKey(c.title);
    const seen = perEvent.get(key) ?? 0;
    if (seen >= PER_EVENT) continue;
    perEvent.set(key, seen + 1);
    picked.push(c);
    if (picked.length >= COUNT) break;
  }

  console.log(`\npicked ${picked.length}, newest first:`);
  for (const c of picked) console.log(`  ${c.day}  ${c.title} — ${c.license} — ${c.credit ?? "no credit"}`);

  if (!OUT) return;
  if (!POST) throw new Error("--out needs --post=<post slug> to aim the jobs at");
  const jobs = [
    ...(EMBED ? [{ post: POST, youtube: EMBED, embed: true }] : []),
    ...picked.map((c) => ({
      post: POST,
      url: c.url,
      alt: c.title.replace(/_/g, " "),
      ...(c.credit ? { credit: c.credit } : {}),
      license: c.license,
      ...(c.licenseUrl ? { licenseUrl: c.licenseUrl } : {}),
      sourceUrl: c.sourceUrl,
    })),
  ];
  writeFileSync(OUT, JSON.stringify(jobs, null, 2));
  console.log(`\nwrote ${jobs.length} job(s) to ${OUT} — run: npm run post-images -- --body=${OUT}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
