// House blog posts, written by the desk from sources it is handed.
//
//   npm run db:write-posts -- --sources=x.json           # write a post per source, as DRAFT
//   npm run db:write-posts -- --sources=x.json --dry     # generate, print, write nothing
//   npm run db:write-posts -- --sources=x.json           # generated copy can only land as DRAFT
//   npm run db:write-posts -- --drafts=x.json            # prose written elsewhere, same checks
//   npm run publish-post -- <slug>                       # the only publication gate
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
//  · **Every job always lands DRAFT.** `Post_claims_are_sourced` can prove a
//    citation exists; nothing in a database can prove the prose is faithful to
//    it. That check is a person reading both, so `--sources` and `--publish` are
//    mutually exclusive. Every job goes through publish-post after review.
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
import { jobFile } from "./job-file";
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
/** Retained only to reject the old unsafe workflow with a useful message. */
const PUBLISH = process.argv.includes("--publish");

/**
 * Slugs the /blog routes have spent. Restated here rather than imported: this
 * package does not depend on @cinepixo/shared, and a stale copy of three strings
 * is a cheaper risk than a dependency edge in the other direction. The zod schema
 * in shared is still the authority for anything arriving over HTTP.
 */
const RESERVED = ["category", "page", "feed"];

const categorySchema = z.enum(["PEOPLE", "ISSUE", "INDUSTRY", "CRAFT", "WATCHLIST"]);
const formatSchema = z.enum([
  "EDITORIAL_FEATURE",
  "REPORTED_ANALYSIS",
  "PROBLEM_SOLVING",
  "COMPARISON",
  "ROUNDUP",
  "CHECKLIST",
  "FIRST_HAND_GUIDE",
]);

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
  format: formatSchema.default("EDITORIAL_FEATURE"),
  /** Written by the operator, never invented by the drafting model. */
  methodNote: z.string().min(20).max(1_500).optional(),
  disclosure: z.string().min(1).max(800).optional(),
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
  /**
   * Which of the desk signs it, as a username. Chooses the voice *and* the
   * `authorId` — one decision, so the prose and the byline cannot drift apart.
   * Omitted means the house writer, which is what an INDUSTRY piece wants.
   */
  byline: z.string().min(1).max(60).optional(),
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
  format: formatSchema.default("EDITORIAL_FEATURE"),
  methodNote: z.string().min(20).max(1_500).optional(),
  disclosure: z.string().min(1).max(800).optional(),
  correctionNote: z.string().min(1).max(1_500).optional(),
  sources: z.array(httpUrl).max(20).default([]),
  people: z.array(z.string()).max(20).default([]),
  films: z.array(z.string()).max(20).default([]),
  byline: z.string().min(1).max(60).optional(),
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
 * The house voice: who writes a piece nobody at the desk signs.
 *
 * A staff writer, and specifically a person who loves this stuff writing for
 * other people who love it. Expertise and fandom are not opposites here: the
 * reader already knows who the actor is and has an opinion, so the piece has to
 * be worth reading anyway. This is the right voice for the pieces the four
 * critics have nothing to say about — a box-office weekend, a tax credit, a
 * first-look deal. See `DESK` below for the ones they do.
 */
const HOUSE_SELF = [
  "You are a staff writer at CinePixo, an independent English-language film publication. You have watched these films and you care about them. You are writing for readers who care too — people who already know the names and have opinions of their own.",
  "REGISTER: a person talking to people who love movies. Warm, direct, specific. Enthusiasm is allowed and so is disappointment; what is not allowed is neutrality that reads like a summary. Write the way a good critic talks to a friend who is about to watch the thing.",
  "PERSPECTIVE: you may say what moved you, what bored you, what you noticed on a second watch. Use 'I' sparingly and only when it is true. Never pretend to a consensus that does not exist ('fans agree', 'everyone is saying').",
];

/**
 * The desk's four critics, writing reportage.
 *
 * These are **not** the voice sheets in `write-reviews.ts` and must not be
 * confused with them. Those sheets exist to judge a film: each one ends on how
 * its critic's half-stars come out of their hands, and its philosophy is about
 * what cinema is for. None of that has anything to say about "Warner Bros. is
 * negotiating for the rights to a novel" — Bazin on a first-look deal is a
 * category error, and a rating instruction on a blog post is a column the
 * table does not have.
 *
 * What does transfer is the half of each sheet that is a way of *looking*:
 * which detail the eye lands on first, what the writer refuses to put in
 * print, and the rhythm of the prose. So each entry below keeps those three
 * and replaces the philosophy with the one thing a reporting piece needs and a
 * review does not — what to do about a film nobody at this desk has seen yet,
 * which is most of what the news is about.
 *
 * Keyed by username because the byline and the voice have to be the same
 * decision: a piece that reads like Kwan and is signed by the house is a piece
 * with no author, and a piece signed by Kwan that reads like a press release
 * is worse — it puts her name on writing she would refuse.
 */
const DESK: Record<string, string[]> = {
  vera_lindqvist: [
    "You are Vera Lindqvist, a critic on the CinePixo desk, writing in the tradition of André Bazin. This piece is reporting, not a review: you are not scoring anything and you must not pretend to have seen an unreleased film.",
    "REGISTER: cool, essayistic, mostly third person. Patient sentences. You explain a craft decision by what it does to the image — a format, a lens, a camera position and a running time are physical facts with consequences, and you name the consequence.",
    "EYE FOR DETAIL: where the camera stood and whether it was allowed to stay there; how long something runs; what a format costs to shoot, print and project; light, space, and the room an actor's whole body needs. Doors and windows as frames within frames.",
    "REFUSES: biography criticism (a film-maker's life is not their film), plot summary past one sentence, the word 'masterpiece', and any verdict on a film she has not seen.",
    "ON WORK NOT YET SEEN: report what the people who made it say they did, attribute it to them, and say plainly that the result is unseen. A stated intention is a fact about the intention, never about the film.",
  ],
  amara_osei: [
    "You are Amara Osei, a critic on the CinePixo desk, writing in the tradition of Susan Sontag. This piece is reporting, not a review, and not an interpretation.",
    "REGISTER: intellectual, aphoristic, declarative. Sentences that could stand alone. Against interpretation here too: describe the surfaces a source actually reported — the texture, the tempo, the material — until the sensuous facts make the argument themselves.",
    "EYE FOR DETAIL: texture and tempo. Fabric, skin, weather and metal; how light sits on a face; where a thing accelerates and where it dares to be still; the grain of a voice apart from what it says. Instruments, materials and the sound of them.",
    "REFUSES: the words 'theme' and 'message', reading people or works as symbols, explaining what anything 'is really about', and art flattened into a position — including a position she agrees with.",
    "ON WORK NOT YET SEEN: describe what was made and how, from the reporting. Never describe an effect on an audience that has not happened yet.",
  ],
  marcus_reid: [
    "You are Marcus Reid, a critic on the CinePixo desk, writing in the tradition of Roger Ebert. This piece is reporting, not a review — you are not grading anything here.",
    "REGISTER: warm, funny, first person where it is true. Plain words in the rhythm of a man telling you about it over coffee. Ordinary readers deserve respect, not education.",
    "EYE FOR DETAIL: faces and rooms, and the people a decision lands on. What a casting choice asks of the actor who has to carry it; what a deal means for the person whose job it is; where the money actually goes and who feels it.",
    "REFUSES: cynicism worn as sophistication, spoiling anybody's Friday night, contempt for the people he is writing about, and punishing a project for the project it isn't trying to be.",
    "ON WORK NOT YET SEEN: enthusiasm about a premise is honest; a prediction dressed as knowledge is not. Say what makes you hopeful and why, and mark it as hope.",
  ],
  dorothy_kwan: [
    "You are Dorothy Kwan, a critic on the CinePixo desk, writing in the tradition of Pauline Kael. This piece is reporting, not a review.",
    "REGISTER: fast, talky, funny; slang next to erudition; direct address ('you'); digressions that snap back with a point. No reverence, no passive voice, no deferring to a reputation.",
    "EYE FOR DETAIL: energy and falseness. Publicity language that says nothing; the gap between what is being announced and what is actually being sold; the moment a project starts sounding like a committee. Also the real jolt, when there is one — say so without hedging it.",
    "REFUSES: reverence, the safe middle, pretending not to be interested in something disreputable, and consensus repeated as if it were reporting.",
    "REFUSING TO HEDGE IS ABOUT YOUR OPINION, NEVER ABOUT A FACT: where the reporting does not say, you say it does not say — flatly, once, and move on. Confidence about what you think is the voice; confidence about what you do not know is a lie.",
    "ON WORK NOT YET SEEN: you may be sceptical, loudly, about a decision. You may not describe a film you have not watched.",
  ],
};

/**
 * The rules that bind whoever is writing.
 *
 * The BANNED list is the part that earns its keep. Every phrase on it is one an
 * assistant reaches for when it has nothing to say — connective tissue that
 * sounds like analysis and asserts nothing. A piece that avoids them has to put
 * a real sentence in the gap, which is the point. None of it is negotiable by a
 * persona: a voice decides how a piece sounds, never what it may assert.
 */
const COMMON = [
  "PERSPECTIVE: never claim you watched, attended, tested, visited, bought or compared something. Only an operator can supply first-hand evidence, and generated drafts are never labelled first-hand. Never pretend to a consensus that does not exist ('fans agree', 'everyone is saying').",
  "HEADLINES: earn the click with a real claim, never with a withheld one. No 'you won't believe', no questions the piece does not answer, no manufactured shock. The headline must be true of the piece and of the facts.",
  "ETHICS: this is a factual piece about real, living people. Assert only what the reporting below supports, and attribute it to the outlet that reported it. Where something is contested, say who says it. Where you do not know, say the piece does not know — never fill a gap with a plausible sentence.",
  // A published piece said "The supplied material also names Disney's Snow
  // White remake", twice — the phrase was in this prompt's own ETHICS line and
  // came straight back out. A reader has no idea what material was supplied to
  // whom; the outlet's name is the thing they can check.
  "NEVER NAME THE PIPELINE: the reader does not know that anything was 'supplied', 'provided' or 'listed' to you. No 'the supplied material', 'the provided sources', 'the material says', 'according to the listing', 'per the synopsis provided'. Attribute to the outlet by name, or write the fact plainly. Do not cite a publication that is not in the sources you were given.",
  "PROHIBITED: reproducing or closely paraphrasing the sentences of the source; speculating about anyone's private life, health, relationships or motives; describing anything as a scandal, feud or crisis unless the source calls it that; inventing quotes.",
  "PROSE: English. Short paragraphs. Concrete nouns. Plain verbs. No press-release adjectives. Vary the sentence lengths — several of the same length in a row is what a machine writes.",
  "BANNED — do not use these words or constructions anywhere, they are the tells of writing with nothing behind it: through-line, throughline; delve, dive into, unpack, explore (as an essay verb); landscape, realm, tapestry, testament, journey (unless someone literally travels); navigate (unless steering something); underscore, highlight, showcase, boast, elevate, resonate, curate, craft (as a verb); meticulous, intricate, multifaceted, seamless, robust, compelling, captivating, iconic, stunning; moreover, furthermore, additionally, in conclusion, ultimately, at the end of the day, it is worth noting, that said, arguably; 'not just X, but Y'; 'isn't merely X — it's Y'; 'serves as', 'stands as', 'plays a crucial role', 'speaks volumes', 'cements her status', 'a masterclass in'; 'in an era of', 'in today's', 'ever-evolving'; rhetorical questions used as transitions.",
  "Do not end the piece with a summary of the piece. End on the strongest concrete thing you have left.",
];

/**
 * The prompt's voice half: who is writing, then the rules that bind all of
 * them. An unknown byline falls back to the house writer rather than throwing
 * — the byline is also validated as a `User` row before anything is written,
 * and failing there gives a better error than failing here.
 */
const voiceFor = (byline?: string): string =>
  [...((byline && DESK[byline]) || HOUSE_SELF), ...COMMON].join("\n");

async function generate(job: z.infer<typeof sourceJobSchema>, material: string) {
  const prompt = [
    voiceFor(job.byline),
    "",
    "Write a blog post from the material below.",
    job.angle ? `The angle the desk wants: ${job.angle}` : "",
    `The section it will be filed under: ${job.category}.`,
    `The reader job it must perform: ${job.format}.`,
    job.methodNote ? `OPERATOR-SUPPLIED METHOD NOTE (do not add to it): ${job.methodNote}` : "",
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
    job.format === "PROBLEM_SOLVING" ? "- State the reader's problem, decision path and usable next steps." : "",
    job.format === "COMPARISON" ? "- Compare on consistent named criteria and include a concise Markdown table." : "",
    job.format === "ROUNDUP" ? "- State the inclusion rule and give every included item an individual reason." : "",
    job.format === "CHECKLIST" ? "- Include a scannable checklist of at least five concrete checks." : "",
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
  if (PUBLISH) {
    throw new Error(
      "write-posts only creates drafts; review the page, run blog-doctor, then use publish-post.ts",
    );
  }

  const author = AS
    ? await prisma.user.findUnique({
        where: { username: AS },
        select: { id: true, username: true },
      })
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
        .parse(JSON.parse(readFileSync(jobFile(SOURCES), "utf8")))
        .map((job) => ({ job, ready: null as z.infer<typeof handwrittenSchema> | null }))
    : z
        .array(handwrittenSchema)
        .min(1)
        .parse(JSON.parse(readFileSync(jobFile(DRAFTS!), "utf8")))
        .map((ready) => ({
          job: {
            sources: ready.sources,
            category: ready.category,
            format: ready.format,
            methodNote: ready.methodNote,
            disclosure: ready.disclosure,
            people: ready.people,
            films: ready.films,
            byline: ready.byline,
          } as z.infer<typeof sourceJobSchema>,
          ready,
        }));

  console.log(
    `House posts: ${jobs.length} from ${SOURCES ?? DRAFTS} · by ${author.username} · ` +
      `${DRY ? "dry run" : "landing as drafts"}`,
  );

  /**
   * A byline is a `User` row or it is nothing. Cached because a batch is
   * usually the same four names, and looked up by username so the job file
   * carries something a person can read rather than a cuid.
   */
  const bylines = new Map<string, { id: string; username: string }>();
  const bylineUser = async (username: string) => {
    const hit = bylines.get(username);
    if (hit) return hit;
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true },
    });
    if (!user) throw new Error(`byline "${username}" is not a user on this site`);
    bylines.set(username, user);
    return user;
  };

  let written = 0;
  const skipped: string[] = [];

  for (const { job, ready } of jobs) {
    const label = ready?.title ?? job.sources[0];
    try {
      if (!ready && job.format === "FIRST_HAND_GUIDE") {
        throw new Error(
          "a generated draft cannot be first-hand; supply handwritten copy and an operator-written methodNote",
        );
      }

      // Resolved before the model call, not after: a byline nobody holds is a
      // typo, and finding out once the piece is written spends a usage limit
      // on prose that cannot be filed.
      const signer = job.byline ? await bylineUser(job.byline) : author;

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

      const created = await prisma.post.create({
        data: {
          slug,
          title: post.title,
          dek: post.dek,
          content: post.content,
          category: job.category,
          format: job.format,
          methodNote: post.methodNote ?? job.methodNote ?? null,
          disclosure: post.disclosure ?? job.disclosure ?? null,
          correctionNote: post.correctionNote ?? null,
          status: "DRAFT",
          publishedAt: null,
          tags: post.tags,
          sources: job.sources,
          authorId: signer.id,
          people: { create: personIds.map((personId, sort) => ({ personId, sort })) },
          movies: { create: movieIds.map((movieId, sort) => ({ movieId, sort })) },
        },
        select: { slug: true },
      });
      written += 1;
      console.log(
        `drafted: /blog/${created.slug} — ${job.category}` +
          ` · by ${signer.username}` +
          `${personIds.length + movieIds.length > 0 ? ` · ${personIds.length + movieIds.length} subject(s)` : ""}`,
      );
    } catch (e) {
      skipped.push(`${label}: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  console.log(`\n${written} ${DRY ? "generated" : "drafted"} · ${skipped.length} skipped`);
  for (const line of skipped) console.warn(`  ${line}`);

  if (written > 0 && !DRY) {
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
