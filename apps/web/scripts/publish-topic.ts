// A topic in, a piece out: gather → write → illustrate → publish, one command.
//
//   npm run publish -- --topic="Anne Hathaway The Odyssey" --category=PEOPLE \
//     --people=anne-hathaway,christopher-nolan --films=interstellar-2014 \
//     --image-query="Anne Hathaway" --images=6
//
// Options:
//   --topic="…"          what the piece is about (required)
//   --category=…         PEOPLE | ISSUE | INDUSTRY | CRAFT | WATCHLIST (default ISSUE)
//   --angle="…"          the steer for the writer, if the topic is not enough
//   --people=a,b         subject slugs, in the order the piece is about them
//   --films=c,d          film slugs
//   --image-query="…"    what the pictures should match, when the story's
//                        phrasing is not a photograph's (default: the topic)
//   --images=N           pictures to place (default 6)
//   --news=N             articles to cite (default 6)
//   --youtube=<url>      a video: cited as a source and embedded in the piece
//   --brief=<file>       facts an operator vouches for, when the outlets refuse
//                        an automated read (Naver and the Korean press always do)
//   --prose=<file.md>    skip generation, use this Markdown (the workstation
//                        path — `codex` lives on the server)
//   --publish            go live now instead of landing a draft
//   --dry                print the plan, write nothing
//
// **It lands a DRAFT unless told otherwise, and that is the point.**
// `Post_claims_are_sourced` can prove a citation exists; nothing here can prove
// the prose is faithful to it. On this piece that check earned its keep — a
// first pass asserted scenes no source described. So the last step is a person,
// and `--publish` is how they say they have done it.
//
// Everything the pictures need is decided for you: newest first, at most two
// frames of one event, licence and credit carried onto the page, and the rows
// spread down the piece (1 / 2 / 2 / 1) rather than stacked at the end.
import "../../../packages/db/prisma/env";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@cinepixo/db";
import {
  type Article,
  type Photo,
  gatherPhotos,
  latestNews,
  photoPlan,
} from "@/lib/gather-sources";
import { youtubeVideoId, youtubeWatchUrl } from "@/lib/post-image-sources";

function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}
const listArg = (name: string) => (strArg(name) ?? "").split(",").filter(Boolean);
const numArg = (name: string, fallback: number) =>
  Number.isFinite(Number(strArg(name))) && strArg(name) ? Number(strArg(name)) : fallback;

const TOPIC = strArg("topic");
const CATEGORY = (strArg("category") ?? "ISSUE") as
  | "PEOPLE" | "ISSUE" | "INDUSTRY" | "CRAFT" | "WATCHLIST";
const ANGLE = strArg("angle");
const PEOPLE = listArg("people");
const FILMS = listArg("films");
const IMAGE_QUERY = strArg("image-query");
const IMAGES = numArg("images", 6);
const NEWS = numArg("news", 6);
const YOUTUBE = strArg("youtube");
const BRIEF = strArg("brief");
const PROSE = strArg("prose");
const PUBLISH = process.argv.includes("--publish");
const DRY = process.argv.includes("--dry");

const SOURCED = ["PEOPLE", "ISSUE"];
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/** Run one of our own scripts and let its output through. */
function step(script: string, args: string[]): void {
  execFileSync("npx", ["tsx", path.join(HERE, script), ...args], {
    stdio: "inherit",
    timeout: 900_000,
    shell: process.platform === "win32",
  });
}

async function main() {
  if (!TOPIC) throw new Error('pass --topic="…" (see the header of this file)');
  if (PUBLISH && SOURCED.includes(CATEGORY) && !DRY) {
    console.log(
      `NOTE: ${CATEGORY} is a factual claim about people. --publish means you are\n` +
        "      vouching for prose you have read against its sources.\n",
    );
  }

  /* 1 ── gather */
  console.log(`Gathering "${TOPIC}"…`);
  let video: { watch: string; title: string | null } | null = null;
  if (YOUTUBE) {
    const id = youtubeVideoId(YOUTUBE);
    if (!id) throw new Error(`not a YouTube video URL: ${YOUTUBE}`);
    video = { watch: youtubeWatchUrl(id), title: null };
  }
  const [news, photos]: [Article[], Photo[]] = await Promise.all([
    latestNews(TOPIC, NEWS),
    gatherPhotos(IMAGE_QUERY ?? TOPIC, IMAGES),
  ]);
  const sources = [...news.map((a) => a.url), ...(video ? [video.watch] : [])];

  console.log(`  ${news.length} article(s), newest first:`);
  for (const a of news) console.log(`    ${a.date}  ${a.host}  ${a.title.slice(0, 80)}`);
  console.log(`  ${photos.length} licensed photograph(s):`);
  for (const p of photos) console.log(`    ${p.day}  ${p.license.padEnd(14)} ${p.title.slice(0, 62)}`);
  if (photos.length === 0) {
    console.log(`    none matched "${IMAGE_QUERY ?? TOPIC}" — try --image-query with a plain name`);
  }
  if (SOURCED.includes(CATEGORY) && sources.length === 0) {
    throw new Error(`${CATEGORY} needs at least one source and the gather found none`);
  }

  /* 2 ── write */
  const dir = mkdtempSync(path.join(tmpdir(), "publish-topic-"));
  try {
    const jobFile = path.join(dir, "job.json");
    const useProse = Boolean(PROSE);
    if (useProse) {
      // Prose written elsewhere still goes through every check write-posts makes.
      const body = readFileSync(PROSE!, "utf8").trim();
      const title = /^#\s+(.+)$/m.exec(body)?.[1] ?? TOPIC;
      writeFileSync(
        jobFile,
        JSON.stringify([
          {
            title,
            dek: strArg("dek") ?? `${TOPIC}, for CinePixo.`,
            content: body.replace(/^#\s+.+$/m, "").trim(),
            tags: [],
            category: CATEGORY,
            sources,
            people: PEOPLE,
            films: FILMS,
          },
        ]),
      );
    } else {
      writeFileSync(
        jobFile,
        JSON.stringify([
          {
            sources,
            category: CATEGORY,
            ...(ANGLE ? { angle: ANGLE } : { angle: TOPIC }),
            ...(BRIEF ? { brief: readFileSync(BRIEF, "utf8").trim() } : {}),
            people: PEOPLE,
            films: FILMS,
          },
        ]),
      );
    }

    if (DRY) {
      console.log(`\n(dry) would write from ${useProse ? "--prose" : "the gathered sources"}`);
      console.log(`(dry) would place ${photos.length} picture(s) as ${JSON.stringify(photoPlan(["a", "b", "c", "d", "e"], photos.length))}`);
      return;
    }

    console.log(`\nWriting${useProse ? " (prose supplied)" : " (codex)"}…`);
    const before = new Set(
      (await prisma.post.findMany({ select: { slug: true } })).map((p) => p.slug),
    );
    step("../../../packages/db/prisma/write-posts.ts", [
      useProse ? `--drafts=${jobFile}` : `--sources=${jobFile}`,
    ]);

    const created = (
      await prisma.post.findMany({
        where: { slug: { notIn: [...before] } },
        select: { slug: true, content: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      })
    )[0];
    if (!created) throw new Error("nothing was written — see the writer's output above");
    console.log(`\nDrafted /blog/${created.slug}`);

    /* 3 ── illustrate */
    if (photos.length > 0) {
      const headings = [...created.content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
      const plan = photoPlan(headings, photos.length - 1); // one is held back for the hero
      const [hero, ...rest] = photos;

      console.log(`\nHero: ${hero.title.slice(0, 70)}`);
      step("fill-post-images.ts", [
        `--post=${created.slug}`,
        `--url=${hero.url}`,
        `--alt=${hero.title.replace(/_/g, " ")}`,
        ...(hero.credit ? [`--credit=${hero.credit}`] : []),
        `--license=${hero.license}`,
        ...(hero.licenseUrl ? [`--license-url=${hero.licenseUrl}`] : []),
        `--source-url=${hero.sourceUrl}`,
      ]);

      const jobs: unknown[] = [];
      if (video) jobs.push({ post: created.slug, youtube: video.watch, embed: true, at: plan[0]?.at });
      let i = 0;
      for (const row of plan) {
        for (let n = 0; n < row.take && i < rest.length; n++, i++) {
          const p = rest[i];
          jobs.push({
            post: created.slug,
            at: row.at,
            url: p.url,
            alt: p.title.replace(/_/g, " "),
            ...(p.credit ? { credit: p.credit } : {}),
            license: p.license,
            ...(p.licenseUrl ? { licenseUrl: p.licenseUrl } : {}),
            sourceUrl: p.sourceUrl,
          });
        }
      }
      const bodyFile = path.join(dir, "body.json");
      writeFileSync(bodyFile, JSON.stringify(jobs, null, 2));
      console.log(`\nPlacing ${jobs.length} block(s) as ${plan.map((r) => r.take).join(" / ")}…`);
      step("fill-post-images.ts", [`--body=${bodyFile}`]);
    }

    /* 4 ── publish, or leave it for a person */
    if (PUBLISH) {
      await prisma.post.update({
        where: { slug: created.slug },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
      console.log(`\nPUBLISHED /blog/${created.slug}`);
    } else {
      console.log(
        `\nLeft as a draft: /blog/${created.slug}\n` +
          "Read it against its sources signed in as an admin, then re-run with --publish\n" +
          "(or flip the status once you have).",
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
