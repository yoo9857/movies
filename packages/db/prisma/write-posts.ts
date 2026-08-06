// House blog posts, written by the desk from sources it is handed.
//
//   npm run db:write-posts -- --sources=x.json           # write a post per source, as DRAFT
//   npm run db:write-posts -- --sources=x.json --dry     # generate, print, write nothing
//   npm run db:write-posts -- --sources=x.json --publish # opt in to going live now
//   npm run db:write-posts -- --drafts=x.json            # prose written elsewhere, same checks
//
// The sibling of write-reviews.ts, and deliberately not a copy of it. A review is
// generated from facts the library already owns — a title, a year, a synopsis we
// imported — so nothing outside the database has to be trusted. A blog post about
// a person is the opposite: every fact in it comes from somewhere else, and that
// somewhere else has to travel with the piece. So a source is not optional input
// here, it is the unit of work.
//
// Three rules this script does not let a caller past:
//
//  · **It lands DRAFT unless told otherwise.** `Post_claims_are_sourced` can prove
//    a citation exists; nothing in a database can prove the prose is faithful to
//    it. That check is a person reading both, so the default is a draft waiting at
//    its own URL (an admin can read it there — see the preview banner). `--publish`
//    is the flag that says a human already did that, or accepts not having.
//  · **It never reproduces the source.** The model is given facts and told to
//    write our own English piece that attributes them. A post that rephrases a wire
//    story is both an infringement and the thing this blog exists not to be.
//  · **A PEOPLE or ISSUE post with no source is refused before generation**, not
//    after, so no model call is spent on something the database would reject.
//
// `brief` is why this is usable at all. Korean news portals (Naver, and the
// outlets syndicated through it) refuse an automated fetch, so a URL alone often
// yields nothing. An operator pastes the facts into `brief`, and the URL stays as
// the citation the page prints. The fetch path is a convenience for sources that
// permit it; the paste path is the one that always works.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import "./env";
import { prisma } from "../src/index";

function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const SOURCES = strArg("sources");
const DRAFTS = strArg("drafts");
/** Whose byline. Defaults to the site's admin — the blog is the desk's. */
const AS = strArg("as");
const DRY = process.argv.includes("--dry");
/** Publish immediately instead of leaving a draft for someone to read. */
const PUBLISH = process.argv.includes("--publish");

/**
 * Slugs the /blog routes have spent. Restated here rather than imported: this
 * package does not depend on @cinepixo/shared, and a stale copy of three strings
 * is a cheaper risk than a dependency edge in the other direction. The zod schema
 * in shared is still the authority for anything arriving over HTTP.
 */
const RESERVED = ["category", "page", "feed"];

/** The two shelves whose claims are about living people. */
const SOURCED_CATEGORIES = ["PEOPLE", "ISSUE"] as const;

const categorySchema = z.enum(["PEOPLE", "ISSUE", "INDUSTRY", "CRAFT", "WATCHLIST"]);

const httpUrl = z
  .string()
  .max(500)
  .refine((u) => /^https?:\/\//.test(u), "a source must be an http(s) URL");

/**
 * One job: what to write about, and what it is allowed to assert.
 *
 * `sources` is a list because a piece worth writing usually rests on more than
 * one report, and because the first URL is not automatically the best one.
 */
const sourceJobSchema = z.object({
  /** Where the facts came from. Printed on the page; at least one for PEOPLE/ISSUE. */
  sources: z.array(httpUrl).min(1).max(20),
  category: categorySchema,
  /**
   * The facts, pasted. Required whenever the sources cannot be fetched — which
   * for Naver-syndicated Korean press is always. Anything the model asserts must
   * be traceable to this text or to a fetched source.
   */
  brief: z.string().min(40).max(20_000).optional(),
  /** Optional steer: the angle the desk wants, in one line. */
  angle: z.string().max(300).optional(),
  /** Person slugs this piece is about, in the order it is about them. */
  people: z.array(z.string()).max(20).default([]),
  /** Film slugs. */
  films: z.array(z.string()).max(20).default([]),
});

/** What the model must return. Anything else is a skip, not a save. */
const generatedSchema = z.object({
  title: z.string().min(10).max(160),
  dek: z.string().min(20).max(400),
  content: z.string().min(900).max(30_000),
  tags: z.array(z.string().min(1).max(60)).max(12).default([]),
});

/** Prose written elsewhere, carrying the context generation would have had. */
const handwrittenSchema = generatedSchema.extend({
  category: categorySchema,
  sources: z.array(httpUrl).max(20).default([]),
  people: z.array(z.string()).max(20).default([]),
  films: z.array(z.string()).max(20).default([]),
});

function postSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 90)
    .replace(/^-+|-+$/g, "");
  // An empty or reserved slug would publish a page nothing can reach.
  return !base || RESERVED.includes(base) ? `post-${Date.now().toString(36)}` : base;
}

/** The model's answer, with whatever chat wrapping it added stripped off. */
function extractJson(stdout: string): unknown {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in output");
  return JSON.parse(stdout.slice(start, end + 1));
}

/**
 * A source's text, when the site allows a machine to read it.
 *
 * Best effort by design: a failure here is not an error, it is the normal case
 * for the Korean entertainment press, and the answer is `brief`. Returns null so
 * the caller can say which it got.
 */
async function fetchSource(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        // Identified rather than disguised. A site that refuses this is refusing
        // on purpose, and the honest response to that is to stop asking.
        "User-Agent": "CinePixoBot/1.0 (+https://cinepixo.com/about)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 200 ? text.slice(0, 12_000) : null;
  } catch {
    return null;
  }
}

/**
 * The house voice for the blog.
 *
 * Not one of the four critics: they review films, and a piece about what an actor
 * is doing off camera is not a review. This is a staff writer at the desk — and
 * specifically a person who loves this stuff, writing for other people who love
 * it. Expertise and fandom are not opposites here: the reader already knows who
 * the actor is and has an opinion, so the piece has to be worth reading anyway.
 *
 * The BANNED list is the part that earns its keep. Every phrase on it is one an
 * assistant reaches for when it has nothing to say — connective tissue that
 * sounds like analysis and asserts nothing. A piece that avoids them has to put
 * a real sentence in the gap, which is the point.
 */
const VOICE = [
  "You are a staff writer at CinePixo, an independent English-language film publication. You have watched these films and you care about them. You are writing for readers who care too — people who already know the names and have opinions of their own.",
  "REGISTER: a person talking to people who love movies. Warm, direct, specific. Enthusiasm is allowed and so is disappointment; what is not allowed is neutrality that reads like a summary. Write the way a good critic talks to a friend who is about to watch the thing.",
  "PERSPECTIVE: you may say what moved you, what bored you, what you noticed on a second watch. Use 'I' sparingly and only when it is true. Never pretend to a consensus that does not exist ('fans agree', 'everyone is saying').",
  "HEADLINES: earn the click with a real claim, never with a withheld one. No 'you won't believe', no questions the piece does not answer, no manufactured shock. The headline must be true of the piece and of the facts.",
  "ETHICS: this is a factual piece about real, living people. Assert only what the supplied material supports, and attribute it to the outlet that reported it. Where something is contested, say who says it. Where you do not know, say the piece does not know — never fill a gap with a plausible sentence.",
  "PROHIBITED: reproducing or closely paraphrasing the sentences of the source; speculating about anyone's private life, health, relationships or motives; describing anything as a scandal, feud or crisis unless the source calls it that; inventing quotes.",
  "PROSE: English. Short paragraphs. Concrete nouns. Plain verbs. No press-release adjectives. Vary the sentence lengths — several of the same length in a row is what a machine writes.",
  "BANNED — do not use these words or constructions anywhere, they are the tells of writing with nothing behind it: through-line, throughline; delve, dive into, unpack, explore (as an essay verb); landscape, realm, tapestry, testament, journey (unless someone literally travels); navigate (unless steering something); underscore, highlight, showcase, boast, elevate, resonate, curate, craft (as a verb); meticulous, intricate, multifaceted, seamless, robust, compelling, captivating, iconic, stunning; moreover, furthermore, additionally, in conclusion, ultimately, at the end of the day, it is worth noting, that said, arguably; 'not just X, but Y'; 'isn't merely X — it's Y'; 'serves as', 'stands as', 'plays a crucial role', 'speaks volumes', 'cements her status', 'a masterclass in'; 'in an era of', 'in today's', 'ever-evolving'; rhetorical questions used as transitions.",
  "Do not end the piece with a summary of the piece. End on the strongest concrete thing you have left.",
].join("\n");

async function generate(job: z.infer<typeof sourceJobSchema>, material: string) {
  const prompt = [
    VOICE,
    "",
    "Write a blog post from the material below.",
    job.angle ? `The angle the desk wants: ${job.angle}` : "",
    `The section it will be filed under: ${job.category}.`,
    "",
    "MATERIAL — every factual claim in your piece must be traceable to this text:",
    material,
    "",
    "SOURCES it will be credited to (do not print these yourself, the page renders them):",
    job.sources.join("\n"),
    "",
    "Requirements:",
    "- 600-900 words of Markdown.",
    "- Exactly four or five `##` section headings, so the page renders a table of contents. Give them real titles, not 'Introduction'.",
    "- Open with the thing that happened, not with scene-setting.",
    "- Attribute reported facts in the prose ('as Edaily reported', 'according to the agency').",
    "- Do not use `#` (the page renders the headline itself), and do not add a sources list.",
    "- The piece is in English, for readers who do not follow the Korean press.",
    "",
    'Answer with ONLY a JSON object, no code fences: {"title": string (the headline), "dek": string (one or two sentences under it, written to be read out of context), "content": string (the Markdown body), "tags": string[] (3-8 long-tail search phrases a reader would actually type, printed on the page)}',
  ]
    .filter(Boolean)
    .join("\n");

  // Prompt in on stdin, answer out through --output-last-message: codex mixes
  // session logs into the terminal stream, and the file is the one channel that
  // carries nothing but the model's final message.
  const dir = mkdtempSync(path.join(tmpdir(), "house-post-"));
  const outFile = path.join(dir, "answer.txt");
  try {
    execFileSync(
      "codex",
      ["exec", "--skip-git-repo-check", "--output-last-message", outFile, "-"],
      {
        input: prompt,
        timeout: 300_000,
        maxBuffer: 8 * 1024 * 1024,
        stdio: ["pipe", "ignore", "ignore"],
      },
    );
    return generatedSchema.parse(extractJson(readFileSync(outFile, "utf8")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Resolve subject slugs to ids, reporting the ones that do not exist. */
async function resolveSubjects(people: string[], films: string[]) {
  const [personRows, movieRows] = await Promise.all([
    people.length > 0
      ? prisma.person.findMany({ where: { slug: { in: people } }, select: { id: true, slug: true } })
      : Promise.resolve([]),
    films.length > 0
      ? prisma.movie.findMany({ where: { slug: { in: films } }, select: { id: true, slug: true } })
      : Promise.resolve([]),
  ]);
  const missing = [
    ...people.filter((s) => !personRows.some((p) => p.slug === s)).map((s) => `person ${s}`),
    ...films.filter((s) => !movieRows.some((m) => m.slug === s)).map((s) => `film ${s}`),
  ];
  // Order is the order the caller asked for — the first subject becomes `about`
  // in the post's markup and the rest become `mentions`.
  return {
    personIds: people.flatMap((s) => personRows.filter((p) => p.slug === s).map((p) => p.id)),
    movieIds: films.flatMap((s) => movieRows.filter((m) => m.slug === s).map((m) => m.id)),
    missing,
  };
}

async function main() {
  if (!SOURCES && !DRAFTS) {
    throw new Error(
      "nothing to write: pass --sources=<file.json> or --drafts=<file.json> (see the header of this file)",
    );
  }

  const author = AS
    ? await prisma.user.findUnique({ where: { username: AS }, select: { id: true, username: true } })
    : await prisma.user.findFirst({
        where: { role: "ADMIN" },
        orderBy: { createdAt: "asc" },
        select: { id: true, username: true },
      });
  if (!author) {
    throw new Error(AS ? `no user named ${AS}` : "no ADMIN user — run the seed first");
  }

  const jobs = SOURCES
    ? z
        .array(sourceJobSchema)
        .min(1)
        .parse(JSON.parse(readFileSync(SOURCES, "utf8")))
        .map((job) => ({ job, ready: null as z.infer<typeof handwrittenSchema> | null }))
    : z
        .array(handwrittenSchema)
        .min(1)
        .parse(JSON.parse(readFileSync(DRAFTS!, "utf8")))
        .map((ready) => ({
          job: {
            sources: ready.sources,
            category: ready.category,
            people: ready.people,
            films: ready.films,
          } as z.infer<typeof sourceJobSchema>,
          ready,
        }));

  console.log(
    `House posts: ${jobs.length} from ${SOURCES ?? DRAFTS} · by ${author.username} · ` +
      `${DRY ? "dry run" : PUBLISH ? "PUBLISHING LIVE" : "landing as drafts"}`,
  );

  let written = 0;
  const skipped: string[] = [];

  for (const { job, ready } of jobs) {
    const label = ready?.title ?? job.sources[0];
    try {
      // Refused before the model is called, not after: the database would reject
      // the row anyway, and a spent generation is a spent usage limit.
      if (
        PUBLISH &&
        SOURCED_CATEGORIES.includes(job.category as (typeof SOURCED_CATEGORIES)[number]) &&
        job.sources.length === 0
      ) {
        throw new Error(
          `${job.category} cannot be published without a source (Post_claims_are_sourced)`,
        );
      }

      let post = ready;
      if (!post) {
        // The pasted brief leads. A fetched page is appended when the site allowed
        // it, so a source that does answer adds detail rather than replacing what
        // the operator vouched for.
        const fetched = job.brief
          ? null
          : (await Promise.all(job.sources.map(fetchSource))).filter(Boolean).join("\n\n");
        const material = job.brief ?? fetched ?? "";
        if (material.length < 40) {
          throw new Error(
            "no material: the sources could not be fetched and no `brief` was supplied — " +
              "paste the facts into `brief` (Korean news portals refuse automated fetches)",
          );
        }
        const generated = await generate(job, material);
        post = { ...generated, ...job };
      }

      const { personIds, movieIds, missing } = await resolveSubjects(job.people, job.films);
      for (const m of missing) console.warn(`  unknown subject, skipped: ${m}`);

      let slug = postSlug(post.title);
      if (await prisma.post.findUnique({ where: { slug }, select: { id: true } })) {
        slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      }

      if (DRY) {
        console.log(
          `\n— ${job.category} · ${slug}\n${post.title}\n${post.dek}\n` +
            `tags: ${post.tags.join(", ")}\nsources: ${job.sources.join(" ")}\n` +
            `${post.content.slice(0, 400)}…`,
        );
        written += 1;
        continue;
      }

      const publishing = PUBLISH;
      const created = await prisma.post.create({
        data: {
          slug,
          title: post.title,
          dek: post.dek,
          content: post.content,
          category: job.category,
          status: publishing ? "PUBLISHED" : "DRAFT",
          publishedAt: publishing ? new Date() : null,
          tags: post.tags,
          sources: job.sources,
          authorId: author.id,
          people: { create: personIds.map((personId, sort) => ({ personId, sort })) },
          movies: { create: movieIds.map((movieId, sort) => ({ movieId, sort })) },
        },
        select: { slug: true },
      });
      written += 1;
      console.log(
        `${publishing ? "published" : "drafted"}: /blog/${created.slug} — ${job.category}` +
          `${personIds.length + movieIds.length > 0 ? ` · ${personIds.length + movieIds.length} subject(s)` : ""}`,
      );
    } catch (e) {
      skipped.push(`${label}: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  console.log(`\n${written} ${DRY ? "generated" : PUBLISH ? "published" : "drafted"} · ${skipped.length} skipped`);
  for (const line of skipped) console.warn(`  ${line}`);

  if (written > 0 && !DRY && !PUBLISH) {
    console.log(
      "\nDrafts are readable at their own /blog/<slug> URL while signed in as an admin —" +
        " noindex, on no shelf and in no feed. Read one against its sources before publishing it.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
