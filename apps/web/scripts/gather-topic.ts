// A topic, thrown at the desk: the latest coverage and the latest licensed
// pictures, printed and written out as the job files the pipeline eats.
//
//   cd apps/web && npx tsx scripts/gather-topic.ts --topic="BTS reunion" \
//     --category=ISSUE --out-sources=sources.json
//   npm run topic -- --topic="…" …                        # from the repo root
//
// This is the *look before you leap* half of `publish-topic.ts`: same sources,
// same rules, but it writes job files for a person to read and edit instead of
// creating anything. Reach for it when the topic is unfamiliar, the picture
// search needs tuning, or an operator wants to strike an article from the list
// before it becomes a citation.
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
//                         --out-body, added as an embed job
//   --out-sources=<file>  a db:write-posts --sources job (one job, this topic)
//   --post=<slug> --out-body=<file>   a post-images --body jobs file
//
// What it will not do: X and Instagram photographs. Both wall off anonymous
// reads, and nothing on either carries a licence this site could print — so
// there is nothing to "gather" there, only things to take. Their *posts* embed
// instead, from the platforms' own endpoints. A photograph the desk has real
// permission for comes in by hand: post-images --file with the post as source.
import { writeFileSync } from "node:fs";
import { DEFAULT_MIN_WIDTH, gatherPhotos, latestNews } from "@/lib/gather-sources";
import { youtubeVideoId, youtubeWatchUrl } from "@/lib/post-image-sources";

function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const TOPIC = strArg("topic");
const IMAGE_QUERY = strArg("image-query");
const NEWS = Number(strArg("news")) || 6;
const IMAGES = Number(strArg("images")) || 8;
/** Lower it when the alternative is no picture at all. */
const MIN_WIDTH = Number(strArg("min-width")) || DEFAULT_MIN_WIDTH;
/**
 * A person every picture must be named after. Without it a name query returns
 * the person, the building named after them, and the school that hosted them.
 */
const SUBJECT = strArg("subject") ?? strArg("image-query");
const CATEGORY = strArg("category") ?? "ISSUE";
const PEOPLE = (strArg("people") ?? "").split(",").filter(Boolean);
const FILMS = (strArg("films") ?? "").split(",").filter(Boolean);
const YOUTUBE = strArg("youtube");
const OUT_SOURCES = strArg("out-sources");
const OUT_BODY = strArg("out-body");
const POST = strArg("post");

async function main() {
  if (!TOPIC) throw new Error('pass --topic="…" (see the header of this file)');

  let video: { watch: string; title: string | null } | null = null;
  if (YOUTUBE) {
    const id = youtubeVideoId(YOUTUBE);
    if (!id) throw new Error(`not a YouTube video URL: ${YOUTUBE}`);
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeWatchUrl(id))}&format=json`,
      { headers: { "User-Agent": "CinePixo/1.0 (https://cinepixo.com)" } },
    ).catch(() => null);
    if (!res?.ok) throw new Error(`YouTube does not answer for ${id}`);
    const meta = (await res.json()) as { title?: string };
    video = { watch: youtubeWatchUrl(id), title: meta.title ?? null };
  }

  const [news, photos] = await Promise.all([
    latestNews(TOPIC, NEWS),
    gatherPhotos(IMAGE_QUERY ?? TOPIC, IMAGES, MIN_WIDTH, SUBJECT ?? undefined),
  ]);

  console.log(`\n"${TOPIC}" — ${news.length} article(s), newest first:`);
  for (const a of news) console.log(`  ${a.date}  ${a.host}  ${a.title}`);
  if (video) console.log(`  video: ${video.title ?? video.watch}`);

  console.log(`\n${photos.length} licensed photograph(s), newest first (min ${MIN_WIDTH}px wide):`);
  for (const p of photos) {
    // Size is printed because recency and sharpness trade off, and only a
    // person looking at both can decide which the piece needs.
    console.log(
      `  ${p.day}  ${String(p.width).padStart(4)}×${String(p.height).padEnd(4)}  ` +
        `${p.title} — ${p.license} — ${p.credit ?? "no credit"}`,
    );
  }
  if (photos.length === 0) {
    console.log(
      `  none matched "${IMAGE_QUERY ?? TOPIC}" at ${MIN_WIDTH}px — try --image-query with the\n` +
        "  plain name, --min-width to accept softer files, or gather-person-photos, which walks\n" +
        "  a person's whole Commons category instead of ranking a search by relevance.",
    );
  }
  console.log(
    "\nNot gathered: X and Instagram photographs (anonymous reads are walled, nothing there" +
      " is licensed for reuse). Their *posts* embed instead: paste the post URL on its own" +
      ' line, or a --body job with "embed": true and the URL. Permission-in-hand files:' +
      " post-images --file=… --source-url=<the post>.",
  );

  if (OUT_SOURCES) {
    writeFileSync(
      OUT_SOURCES,
      JSON.stringify(
        [
          {
            sources: [...news.map((a) => a.url), ...(video ? [video.watch] : [])],
            category: CATEGORY,
            angle: TOPIC,
            people: PEOPLE,
            films: FILMS,
          },
        ],
        null,
        2,
      ),
    );
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
    console.log(
      `wrote ${jobs.length} body job(s) to ${OUT_BODY} — add an "at" to each to place them,` +
        ` then: npm run post-images -- --body=${OUT_BODY}`,
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
