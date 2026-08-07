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
//   --youtube=<url>      repeatable; cited and used as a credited thumbnail
//                        when licensed photographs do not fill the page
//   --social=<url>       repeatable X status / Instagram post; embedded from
//                        the platform (the photograph is never copied)
//   --min-pictures=N     publication floor, hero included (default 4)
//   --allow-few-pictures publish below that floor as a deliberate exception
//   --brief=<file>       facts an operator vouches for, when the outlets refuse
//                        an automated read (Naver and the Korean press always do)
//   --prose=<file.md>    skip generation, use this Markdown (the workstation
//                        path — `codex` lives on the server). A leading `# `
//                        line becomes the headline.
//   --dek="…"            the standfirst, with --prose. Twenty characters at
//                        least, because it is what a search result shows and
//                        the writer's job to make it worth reading.
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
  gatherForSubjects,
  gatherPhotos,
  latestNews,
  photoAlt,
  photoPlan,
  rhythmCapacity,
} from "@/lib/gather-sources";
import {
  instagramEmbedUrl,
  xStatusId,
  youtubeVideoId,
  youtubeWatchUrl,
} from "@/lib/post-image-sources";
import { DEFAULT_MIN_POST_PICTURES, minimumPictureMessage } from "@/lib/post-visuals";

function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}
function strArgs(name: string): string[] {
  return process.argv
    .filter((a) => a.startsWith(`--${name}=`))
    .map((a) => a.split("=").slice(1).join("=").trim())
    .filter(Boolean);
}
const listArg = (name: string) => (strArg(name) ?? "").split(",").filter(Boolean);
const numArg = (name: string, fallback: number) =>
  Number.isFinite(Number(strArg(name))) && strArg(name) ? Number(strArg(name)) : fallback;

const CATEGORIES = ["PEOPLE", "ISSUE", "INDUSTRY", "CRAFT", "WATCHLIST"] as const;

const TOPIC = strArg("topic");
/** Parsed, not cast: a typo used to travel all the way to a generic failure. */
const CATEGORY = (() => {
  const raw = strArg("category") ?? "ISSUE";
  if (!(CATEGORIES as readonly string[]).includes(raw)) {
    throw new Error(`--category must be one of ${CATEGORIES.join(", ")} (got "${raw}")`);
  }
  return raw as (typeof CATEGORIES)[number];
})();
const ANGLE = strArg("angle");
const PEOPLE = listArg("people");
const FILMS = listArg("films");
const IMAGE_QUERY = strArg("image-query");
const IMAGES = numArg("images", 6);
const NEWS = numArg("news", 6);
const YOUTUBES = [...new Set(strArgs("youtube"))];
const SOCIALS = [...new Set(strArgs("social"))];
const BRIEF = strArg("brief");
const PROSE = strArg("prose");
const PUBLISH = process.argv.includes("--publish");
const DRY = process.argv.includes("--dry");
const ALLOW_FEW_PICTURES = process.argv.includes("--allow-few-pictures");
const MIN_PICTURES = numArg("min-pictures", DEFAULT_MIN_POST_PICTURES);

const SOURCED = ["PEOPLE", "ISSUE"];

/**
 * Cut a gathered field to what the admin form will accept.
 *
 * `postInputSchema` caps alt and credit at 300; the database does not, and a
 * Commons `Artist` field routinely carries a whole attribution sentence. Left
 * alone, the pipeline writes a post the editor then cannot save — an error on a
 * field they never typed into.
 */
function clampField(value: string, max: number): string {
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/**
 * Run one of our own scripts and let its output through.
 *
 * `shell: false`, which means finding `tsx` ourselves. It is worth the lookup:
 * under a shell Node joins argv with spaces and quotes nothing, so
 * `--alt=Anne Hathaway at the premiere` reached the child as `--alt=Anne` and
 * was stored — silently, because one word still satisfies the schema. An `&`
 * in a licence URL was worse on Windows, where cmd reads it as a separator.
 */
const TSX = path.join(HERE, "..", "..", "..", "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

function step(script: string, args: string[]): void {
  execFileSync(TSX, [path.join(HERE, script), ...args], {
    stdio: "inherit",
    timeout: 900_000,
  });
}

/** What `postJobSchema` will accept, checked before anything is spent. */
const ANGLE_MAX = 300;

async function main() {
  if (!TOPIC) throw new Error('pass --topic="…" (see the header of this file)');
  // Refused here for the same reason --dek is: write-posts validates the job
  // file only after this script has fetched the news and gathered pictures for
  // every subject, so an angle one sentence too long threw away a full gather
  // and told the operator about it in a ZodError with a path of [0, "angle"].
  if (ANGLE && ANGLE.length > ANGLE_MAX) {
    throw new Error(
      `--angle is ${ANGLE.length} characters and the writer takes at most ${ANGLE_MAX}. ` +
        "Cut it to the steer itself — the sources carry the detail.",
    );
  }
  if (PUBLISH && SOURCED.includes(CATEGORY) && !DRY) {
    console.log(
      `NOTE: ${CATEGORY} is a factual claim about people. --publish means you are\n` +
        "      vouching for prose you have read against its sources.\n",
    );
  }

  /* 1 ── gather */
  console.log(`Gathering "${TOPIC}"…`);
  if (!Number.isInteger(MIN_PICTURES) || MIN_PICTURES < 0) {
    throw new Error("--min-pictures must be a non-negative integer");
  }
  const videos = await Promise.all(
    YOUTUBES.map(async (url) => {
      const id = youtubeVideoId(url);
      if (!id) throw new Error(`not a YouTube video URL: ${url}`);
      const watch = youtubeWatchUrl(id);
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
        { headers: { "User-Agent": "CinePixo/1.0 (+https://cinepixo.com)" } },
      ).catch(() => null);
      if (!res?.ok) throw new Error(`YouTube does not answer for ${id}`);
      const meta = (await res.json()) as { title?: string };
      return { watch, title: meta.title?.trim() || TOPIC! };
    }),
  );
  for (const url of SOCIALS) {
    if (!xStatusId(url) && !instagramEmbedUrl(url)) {
      throw new Error(`not an X status or Instagram post URL: ${url}`);
    }
  }
  /**
   * Who the pictures should be of: the operator's steer first, then everyone
   * the piece links. One name cannot fill a page — see `gatherForSubjects` —
   * so the subjects the piece already declares become the picture queries.
   */
  const subjectNames = PEOPLE.length
    ? (
        await prisma.person.findMany({
          where: { slug: { in: PEOPLE } },
          select: { slug: true, name: true },
        })
      )
        // findMany does not preserve the order asked for, and the order is the
        // piece's own ranking of who it is about.
        .sort((a, b) => PEOPLE.indexOf(a.slug) - PEOPLE.indexOf(b.slug))
        .map((p) => p.name)
    : [];
  const subjects = [...(IMAGE_QUERY ? [IMAGE_QUERY] : []), ...subjectNames];
  if (subjects.length) console.log(`  picture subjects: ${subjects.join(", ")}`);

  const [news, photos]: [Article[], Photo[]] = await Promise.all([
    latestNews(TOPIC, NEWS),
    subjects.length
      ? gatherForSubjects(subjects, IMAGES, undefined, (subject, found) => {
          console.log(
            `    ${subject}: ${found} picture(s)` +
              (found === 0 ? "  ← nothing matched this name; check its spelling" : ""),
          );
        })
      : gatherPhotos(IMAGE_QUERY ?? TOPIC, IMAGES),
  ]);
  const sources = [...news.map((a) => a.url), ...videos.map((v) => v.watch), ...SOCIALS];

  console.log(`  ${news.length} article(s), newest first:`);
  for (const a of news) console.log(`    ${a.date}  ${a.host}  ${a.title.slice(0, 80)}`);
  console.log(`  ${photos.length} licensed photograph(s):`);
  for (const p of photos) console.log(`    ${p.day}  ${p.license.padEnd(14)} ${p.title.slice(0, 62)}`);
  if (photos.length === 0) {
    console.log(
      `    none matched ${subjects.length ? subjects.join(" / ") : `"${IMAGE_QUERY ?? TOPIC}"`}` +
        " — try --image-query with a plain name",
    );
  }
  if (videos.length > 0) console.log(`  ${videos.length} operator-approved YouTube thumbnail(s)`);
  if (SOCIALS.length > 0) console.log(`  ${SOCIALS.length} X/Instagram post embed(s)`);
  const availablePictures = photos.length + videos.length;
  if (availablePictures < MIN_PICTURES) {
    const message = minimumPictureMessage(availablePictures, MIN_PICTURES);
    if (PUBLISH && !ALLOW_FEW_PICTURES) {
      throw new Error(
        `${message}. Supply repeatable --youtube=<url> fallbacks, tune --image-query, ` +
          "or pass --allow-few-pictures for a deliberate exception.",
      );
    }
    console.warn(`  WARNING: ${message}`);
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
      // Refused here rather than let write-posts skip the job and report the
      // generic "nothing was written": the schema wants 20 characters, and a
      // short topic makes the default fall under it.
      const dek = strArg("dek") ?? `${TOPIC}, for CinePixo.`;
      if (dek.length < 20) {
        throw new Error(`--dek must be at least 20 characters (the default from --topic is "${dek}")`);
      }
      writeFileSync(
        jobFile,
        JSON.stringify([
          {
            title,
            dek,
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
      // One is held back for the hero, and the real headings are not known
      // until the piece exists — so this is the shape against a typical five,
      // trimmed the same way the real run trims it.
      const typical = ["a", "b", "c", "d", "e"];
      const body = Math.min(
        Math.max(0, photos.length + videos.length - 1),
        rhythmCapacity(typical),
      );
      const shape = photoPlan(typical, body)
        .map((r) => r.take)
        .join(" / ");
      console.log(
        `(dry) 1 hero + ${body} in the body as ${shape || "nothing to place"}`,
      );
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
    if (photos.length + videos.length > 0) {
      const headings = [...created.content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
      type Picture =
        | { kind: "photo"; value: Photo }
        | { kind: "youtube"; value: (typeof videos)[number] };
      const candidates: Picture[] = [
        ...photos.map((value): Picture => ({ kind: "photo", value })),
        ...videos.map((value): Picture => ({ kind: "youtube", value })),
      ];
      // Exactly what the rhythm holds, and no more. `photoPlan` never drops a
      // picture, so a generous gather used to end 1 / 2 / 2 / 7 — the overflow
      // stacked under the last heading, which is the layout the rhythm exists
      // to avoid. The extras are left ungathered rather than dumped.
      const capacity = Math.max(rhythmCapacity(headings), MIN_PICTURES - 1);
      const [hero, ...rest] = candidates.slice(0, 1 + capacity);
      const plan = photoPlan(headings, rest.length);
      if (candidates.length > 1 + rest.length) {
        console.log(
          `  ${candidates.length - 1 - rest.length} picture(s) held back: ` +
            `${headings.length} heading(s) hold ${rest.length} in the body`,
        );
      }

      if (hero.kind === "photo") {
        const p = hero.value;
        console.log(`\nHero: ${p.title.slice(0, 70)}`);
        step("fill-post-images.ts", [
          `--post=${created.slug}`,
          `--url=${p.url}`,
          `--alt=${clampField(photoAlt(p.description, p.title, p.subject), 300)}`,
          ...(p.credit ? [`--credit=${clampField(p.credit, 300)}`] : []),
          `--license=${p.license}`,
          ...(p.licenseUrl ? [`--license-url=${p.licenseUrl}`] : []),
          `--source-url=${p.sourceUrl}`,
        ]);
      } else {
        console.log(`\nHero: ${hero.value.title.slice(0, 70)} (YouTube thumbnail)`);
        step("fill-post-images.ts", [
          `--post=${created.slug}`,
          `--youtube=${hero.value.watch}`,
          `--alt=${clampField(hero.value.title, 300)}`,
        ]);
      }

      const jobs: unknown[] = [];
      // The video first and on its own heading, never sharing one with a photo
      // row: two blocks at the same `at` are spliced at the same index, and the
      // second one lands above the first — which read as the jobs file inverted.
      const pictureJob = (picture: Picture, at?: string) => {
        if (picture.kind === "youtube") {
          return {
            post: created.slug,
            ...(at ? { at } : {}),
            youtube: picture.value.watch,
            alt: clampField(picture.value.title, 300),
          };
        }
        const p = picture.value;
        return {
          post: created.slug,
          ...(at ? { at } : {}),
          url: p.url,
          alt: clampField(photoAlt(p.description, p.title, p.subject), 300),
          ...(p.credit ? { credit: clampField(p.credit, 300) } : {}),
          license: p.license,
          ...(p.licenseUrl ? { licenseUrl: p.licenseUrl } : {}),
          sourceUrl: p.sourceUrl,
        };
      };
      let i = 0;
      for (const row of plan) {
        for (let n = 0; n < row.take && i < rest.length; n++, i++) {
          jobs.push(pictureJob(rest[i], row.at));
        }
      }
      // Anything the rhythm had no room for still goes in, at the end — the
      // no-dropping rule, which `photoPlan` cannot honour when a piece has no
      // `##` headings at all and it returns an empty plan.
      for (; i < rest.length; i++) {
        jobs.push(pictureJob(rest[i]));
      }
      for (let n = 0; n < SOCIALS.length; n++) {
        const at = headings.length
          ? headings[
              Math.min(
                headings.length - 1,
                Math.floor(((n + 1) * headings.length) / (SOCIALS.length + 1)),
              )
            ]
          : undefined;
        jobs.push({ post: created.slug, url: SOCIALS[n], embed: true, ...(at ? { at } : {}) });
      }

      if (jobs.length === 0) {
        console.log("\nNo body pictures: the hero took the only one gathered.");
      } else {
        const bodyFile = path.join(dir, "body.json");
        writeFileSync(bodyFile, JSON.stringify(jobs, null, 2));
        const shape = plan.map((r) => r.take).join(" / ") || "appended";
        console.log(`\nPlacing ${jobs.length} block(s) as ${shape}…`);
        step("fill-post-images.ts", [`--body=${bodyFile}`]);
      }
    }

    /* 4 ── publish, or leave it for a person */
    if (photos.length + videos.length === 0 && SOCIALS.length > 0) {
      const headings = [...created.content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
      const jobs = SOCIALS.map((url, n) => {
        const at = headings.length
          ? headings[
              Math.min(
                headings.length - 1,
                Math.floor(((n + 1) * headings.length) / (SOCIALS.length + 1)),
              )
            ]
          : undefined;
        return { post: created.slug, url, embed: true, ...(at ? { at } : {}) };
      });
      const bodyFile = path.join(dir, "body-social.json");
      writeFileSync(bodyFile, JSON.stringify(jobs, null, 2));
      step("fill-post-images.ts", [`--body=${bodyFile}`]);
    }

    if (PUBLISH) {
      step("publish-post.ts", [
        created.slug,
        `--min-pictures=${MIN_PICTURES}`,
        ...(ALLOW_FEW_PICTURES ? ["--allow-few-pictures"] : []),
      ]);
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
