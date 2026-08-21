// The unattended news lane: six pieces, twice a day, nothing said twice.
//
//   npm run news-lane                      # six, live
//   npm run news-lane -- --count=3
//   npm run news-lane -- --no-publish      # write them, hold at DRAFT
//   npm run news-lane -- --dry             # print the plan, write nothing
//   npm run news-lane -- --allow-sensitive # own the claims a person would read
//
// Cron (the box is UTC, so this is 09:00 and 21:00 KST) — the wrapper and how to
// install it are in `ops/news-lane/`, which is in the clone the server pulls:
//   0 0,12 * * * /home/hanbin9857/cinepixo/ops/news-lane/lane-news.sh
//
// **What this lane is allowed to decide, and what it is not.**
// It decides *what* to write about: which stories are new, which of them name
// somebody we have a page for, and which shelf they belong on. It does not
// decide whether the prose is faithful to its sources — nothing can, which is
// why `publish-topic` leaves that to a person. Running unattended means that
// judgement is being skipped, deliberately, by whoever turned the cron on. So
// the lane spends its care on the failures a machine *can* see, and holds a
// piece at DRAFT rather than publishing it when any of them trip:
//
//   · fewer than four pictures, or no hero — the house layout, and a bare post
//     looks abandoned rather than new. The hero is named separately because
//     `publish-post` refuses one without it and reported that to the lane as an
//     opaque "Command failed";
//   · a headline or standfirst turning on death, addiction, an allegation or a
//     court — the claims where being wrong is a libel rather than a correction.
//     `--allow-sensitive` is how somebody takes that on;
//   · a linked subject the prose never names — the failure of 2026-08-21,
//     where a piece about Korean release windows went out under a photograph
//     of Jun Ji-hyun, who appears in neither the article nor its sources;
//   · a picture whose caption reads as a place rather than a person — the same
//     day's cemetery in Villeneuve-Saint-Denis — or as a *file* rather than as
//     what it shows ("A cropped version of File:Johnny Depp (3).jpg", which
//     also shipped). `looksLikePlace` and `photoAlt` refuse both at the gather
//     now; these check again, because the gather is the thing most likely to
//     grow a new way of being wrong.
//
// A held piece is not lost: it sits at its own URL, admin-only and noindex,
// and `publish-post <slug>` takes it live once someone has looked.
import "../../../packages/db/prisma/env";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { prisma } from "@cinepixo/db";
import { type Article, latestNews, looksLikePlace } from "@/lib/gather-sources";
import {
  type Candidate,
  isNearDuplicate,
  nameCandidates,
  namedInProse,
  normalizeUrl,
  pickSpread,
  storyQuery,
  titleCandidates,
  titleTokens,
} from "@/lib/news-lane";
import { DEFAULT_MIN_POST_PICTURES, postPictureCount } from "@/lib/post-visuals";

/**
 * The standing beats.
 *
 * Broad on purpose: a query narrow enough to name a film is a query that
 * returns the same film every day. These are the *sections* of a film desk,
 * and the duplicate gate is what keeps the same story out of two of them.
 */
const BEATS: { query: string; category: Candidate["category"] }[] = [
  { query: "film director new movie", category: "PEOPLE" },
  { query: "actor cast in film", category: "PEOPLE" },
  { query: "film star interview", category: "PEOPLE" },
  { query: "director says film", category: "PEOPLE" },
  { query: "actress role film", category: "PEOPLE" },
  { query: "screenwriter film adaptation", category: "PEOPLE" },
  { query: "film casting news", category: "PEOPLE" },
  { query: "box office weekend", category: "INDUSTRY" },
  { query: "film studio deal", category: "INDUSTRY" },
  { query: "film festival lineup", category: "INDUSTRY" },
  { query: "film tax incentive production", category: "INDUSTRY" },
  { query: "film producer first-look deal", category: "INDUSTRY" },
  { query: "cinematographer film shot", category: "CRAFT" },
  { query: "film editing visual effects", category: "CRAFT" },
  { query: "film score composer", category: "CRAFT" },
  { query: "production designer costume film", category: "CRAFT" },
  { query: "film industry controversy", category: "ISSUE" },
  { query: "streaming theatrical window", category: "ISSUE" },
  { query: "AI filmmaking actors", category: "ISSUE" },
  { query: "director responds criticism film", category: "ISSUE" },
  // Volume, added after a run found only 28 fresh stories across thirteen
  // beats and could not fill six slots from them.
  { query: "film sequel announced", category: "INDUSTRY" },
  { query: "movie release date moved", category: "INDUSTRY" },
  { query: "film rights book adaptation", category: "INDUSTRY" },
  { query: "actor joins cast opposite", category: "PEOPLE" },
  { query: "filmmaker next project announced", category: "PEOPLE" },
  { query: "film premiere red carpet", category: "PEOPLE" },
  { query: "practical effects stunts film", category: "CRAFT" },
  { query: "film sound design mix", category: "CRAFT" },
  { query: "movie theatre exhibitors", category: "ISSUE" },
];

/**
 * A story one outlet carried alone is a rumour; two is a story.
 *
 * Three was the first setting and it was the gate that starved the lane: of 28
 * fresh candidates it rejected 18, and the run wrote one piece where six were
 * asked for. `latestNews` already keeps one article per host, so "two" here
 * means two newsrooms, not two copies of a syndicate — and two accounts is
 * what a piece needs to have anything to weigh.
 */
const MIN_OUTLETS = 2;
/**
 * Days a subject rests before the lane writes about them again.
 *
 * The URL and headline gates catch a story told twice; they cannot catch the
 * site running three pieces about one actor in a week, because each is a
 * genuinely different story. A reader does not experience that as coverage.
 * The first dry run offered a follow-up on someone we had published two days
 * earlier, which is how this got a number.
 */
const SUBJECT_REST_DAYS = 14;
/** Photo subjects, and so also the people the piece links. More dilutes both. */
const MAX_PEOPLE = 3;
const MAX_FILMS = 4;

/**
 * Who on the desk signs which shelf.
 *
 * Not a rotation across all four, because the four are not interchangeable and
 * their voice sheets say so. Vera's eye is camera position and running time
 * and Amara's is texture and tempo — that *is* the CRAFT shelf. Marcus writes
 * about the people a decision lands on and Dorothy about the gap between what
 * is announced and what is being sold, which is PEOPLE and ISSUE.
 *
 * INDUSTRY is deliberately unsigned. A box-office weekend, a tax-credit cap and
 * a first-look deal are reporting, and none of the four has a way of looking
 * that bears on them; putting Bazin's name over a rights negotiation would be
 * a costume. Those go out in the house voice, as they always have.
 *
 * Two per shelf so a slot that files two CRAFT pieces does not sign both with
 * the same name.
 */
const DESK_BY_SHELF: Record<Candidate["category"], string[]> = {
  CRAFT: ["vera_lindqvist", "amara_osei"],
  PEOPLE: ["marcus_reid", "dorothy_kwan"],
  ISSUE: ["dorothy_kwan", "marcus_reid"],
  INDUSTRY: [],
};

/**
 * How old a story may be and still be news.
 *
 * The beats are broad, and Bing's news index is not a wire: a query for
 * "cinematographer film shot" returned an Oscar win from March and a first
 * dry run happily queued it as today's coverage. A lane advertised as running
 * twice a day has to be about the last few days or it is a features desk with
 * a cron job.
 */
const MAX_STORY_AGE_DAYS = 14;

/**
 * Claims that do not go out unread, whatever the cron says.
 *
 * Not squeamishness: a `PEOPLE` or `ISSUE` piece is a factual claim about
 * someone who can be harmed by our getting it wrong — the reason
 * `Post_claims_are_sourced` exists — and these are the words that mark the
 * claims where being wrong is a libel rather than a correction. The lane's
 * very first draft was a director's account of an actor "fighting to stay
 * sober" on set, and the sources turn out to be about her death. Every
 * citation real; nobody had read a sentence of it.
 *
 * **Headline and standfirst only, and that is not laziness.** Scanning the
 * body was tried first and it is hopeless: film writing is *about* death,
 * assault, addiction and arrest, because films are. One broad body list held
 * four of six pieces on words like "accusations" about CGI; the narrowed one
 * still held a Halle Berry birthday retrospective on the word "death". A
 * keyword has no way to tell a character's death from a person's. What the
 * piece *leads with* does carry that signal — the lead is the claim — so that
 * is where the filter reads.
 *
 * A held piece is written, illustrated and sitting at its own URL; it waits
 * for a person, which costs a day rather than a retraction. `--allow-sensitive`
 * turns the check off for whoever wants to own that.
 */
const SENSITIVE_LEAD =
  /\b(sober|sobriety|addict|rehab|overdose|alcoholi|assault|rape|abuse|harass|misconduct|allegation|accus|lawsuit|sued|defamation|arrest|convict|indict|fraud|died|death|obituar|suicide|custody|divorce|miscarriage|cancer|diagnos|deport|racis|antisemit|homophob|transphob)/i;

const strArg = (name: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
};
const numArg = (name: string, fallback: number): number => {
  const raw = strArg(name);
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
};

const COUNT = numArg("count", 6);
const DRY = process.argv.includes("--dry");
const PUBLISH = !process.argv.includes("--no-publish");
const ALLOW_SENSITIVE = process.argv.includes("--allow-sensitive");

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const TSX = path.join(
  HERE, "..", "..", "..", "node_modules", ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

const LOG_DIR = path.join(process.env.HOME ?? ".", "fill-logs");
const LOG_FILE = path.join(LOG_DIR, "news-lane.log");
/** Both places: the terminal for a person watching, the file for the cron run nobody watched. */
function say(line: string): void {
  console.log(line);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, `${new Date().toISOString()}  ${line}\n`);
  } catch {
    // A lane that cannot write its log still has work to do.
  }
}

function run(script: string, args: string[]): void {
  execFileSync(TSX, [path.join(HERE, script), ...args], { stdio: "inherit", timeout: 900_000 });
}

/**
 * The names in a headline that we already have a page for.
 *
 * Exact match on the whole name, so "Denis Villeneuve" resolves and
 * "Villeneuve" does not — a surname alone is how you attach the wrong person.
 * `wikipediaUrl IS NOT NULL` is the enrichment mark: among 208,000 imported
 * rows it separates the people a later pass has actually verified from the
 * bare Wikidata labels, and a bare label is where a homonym lives.
 */
async function resolvePeople(headline: string): Promise<{ slug: string; name: string }[]> {
  const candidates = nameCandidates(headline).filter((n) => n.split(/\s+/).length >= 2);
  if (candidates.length === 0) return [];
  const rows = await prisma.$queryRaw<{ slug: string; name: string }[]>`
    SELECT slug, name FROM "Person"
    WHERE lower(name) = ANY(${candidates.map((c) => c.toLowerCase())}::text[])
      AND "wikipediaUrl" IS NOT NULL
    LIMIT 12
  `;
  // Longest name first: when a headline yields both "Paul Thomas" and "Paul
  // Thomas Anderson", the longer match is the one that is actually a person.
  return rows
    .sort((a, b) => b.name.length - a.name.length)
    .filter((row, i, all) => !all.slice(0, i).some((kept) => kept.name.toLowerCase().includes(row.name.toLowerCase())))
    .slice(0, MAX_PEOPLE);
}

/**
 * How widely Wikipedia carries a film, as the test of whether a headline
 * containing its title actually means it.
 *
 * A title collides far more often than a name does, and a run proved it the
 * expensive way: "Every red-carpet look from the 'Don't Say Good Luck'
 * premiere" linked *Good Luck* (1923), (1935) and (2000), and the piece went
 * live saying so. `voteCount` cannot arbitrate — it is null on 118,805 of
 * 118,814 rows, because the library came from Wikidata and not TMDB — but
 * `wikidataSitelinks` is populated on all of them and separates the two cases
 * cleanly: those three Good Lucks carry 5, 4 and 3 language links, while
 * Black Panther carries 76, The Odyssey (2026) 58 and Sinners 47. Twenty sits
 * in the gap, and it also drops The Odyssey (2016) at 15, which is right: a
 * headline saying "The Odyssey" today means Nolan's.
 */
const MIN_FILM_SITELINKS = 20;

async function resolveFilms(headline: string): Promise<string[]> {
  const { grams, single } = titleCandidates(headline);
  if (grams.length === 0 && single.length === 0) return [];
  const rows = await prisma.$queryRaw<{ slug: string }[]>`
    SELECT slug FROM "Movie"
    WHERE lower(title) = ANY(${[...grams, ...single].map((c) => c.toLowerCase())}::text[])
      AND COALESCE("wikidataSitelinks", 0) >= ${MIN_FILM_SITELINKS}
    ORDER BY COALESCE("wikidataSitelinks", 0) DESC
    LIMIT ${MAX_FILMS}
  `;
  return rows.map((r) => r.slug);
}

interface History {
  urls: Set<string>;
  titles: Set<string>[];
  /** Slugs of people a recent piece links. */
  rested: Set<string>;
  /** Recent headlines and standfirsts, for the people a recent piece was *about*. */
  recentLeads: string;
}

/** Everything the lane must not write again. */
async function history(): Promise<History> {
  const posts = await prisma.post.findMany({ select: { title: true, sources: true } });
  const urls = new Set<string>();
  for (const post of posts) for (const url of post.sources) urls.add(normalizeUrl(url));

  const since = new Date(Date.now() - SUBJECT_REST_DAYS * 86_400_000);
  const recent = await prisma.post.findMany({
    where: { createdAt: { gte: since } },
    select: {
      title: true,
      dek: true,
      people: { select: { person: { select: { slug: true } } } },
    },
  });
  return {
    urls,
    titles: posts.map((p) => titleTokens(p.title)),
    rested: new Set(recent.flatMap((p) => p.people.map((x) => x.person.slug))),
    // The links are not the whole record: posts written before the lane existed
    // often have no `PostPerson` row at all — the piece on Hayden Panettiere of
    // 2026-08-18 links nobody — so a slug-only rest check let a follow-up on
    // her through three days later.
    //
    // Leads, not bodies. Reading the whole prose rested every name a piece
    // mentioned in passing, and six pieces of 1,100 words mention a great many
    // people: the funnel went from six takes to one. What a piece was *about*
    // is in its headline and standfirst.
    recentLeads: recent.map((p) => `${p.title}\n${p.dek}`).join("\n\n"),
  };
}

async function gatherCandidates(seen: {
  urls: Set<string>;
  titles: Set<string>[];
}): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const takenTitles = [...seen.titles];
  const oldest = new Date(Date.now() - MAX_STORY_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);
  let stale = 0;
  for (const beat of BEATS) {
    const articles = await latestNews(beat.query, 10);
    for (const article of articles) {
      // "1970-01-01" is what `latestNews` writes when a feed gave no date, and
      // an undated item is exactly the one that turns out to be from March.
      if (article.date < oldest) {
        stale++;
        continue;
      }
      if (seen.urls.has(normalizeUrl(article.url))) continue;
      if (isNearDuplicate(article.title, takenTitles)) continue;
      takenTitles.push(titleTokens(article.title));
      out.push({
        topic: article.title,
        category: beat.category,
        urls: [article.url],
        date: article.date,
      });
    }
  }
  if (stale > 0) say(`   ${stale} story/stories older than ${MAX_STORY_AGE_DAYS} days, left alone`);
  return out;
}

/** What the lane can see about a piece it just wrote. */
interface Verdict {
  ok: boolean;
  reasons: string[];
}

async function verify(slug: string): Promise<Verdict> {
  const post = await prisma.post.findUnique({
    where: { slug },
    select: {
      title: true,
      dek: true,
      content: true,
      image: true,
      imageAlt: true,
      people: { select: { person: { select: { name: true } } } },
    },
  });
  if (!post) return { ok: false, reasons: ["the post is gone"] };
  const reasons: string[] = [];

  const pictures = postPictureCount(post.content, post.image);
  if (pictures < DEFAULT_MIN_POST_PICTURES) {
    reasons.push(`${pictures} picture(s), the house layout wants ${DEFAULT_MIN_POST_PICTURES}`);
  }
  // The hero specifically, not just the count. A piece with five body pictures
  // and no hero passes the count and is then refused by `publish-post`, which
  // reported itself to the lane as an opaque "Command failed" — the reason was
  // knowable here all along.
  if (!post.image) reasons.push("no hero: the share card and every card that links this piece need one");
  if (!ALLOW_SENSITIVE) {
    const hit = SENSITIVE_LEAD.exec(`${post.title}\n${post.dek}`);
    if (hit) reasons.push(`a claim about a person turning on "${hit[0]}" — a person reads this one`);
  }
  for (const { person } of post.people) {
    if (!namedInProse(person.name, post.content)) {
      reasons.push(`links ${person.name}, whom the prose never names`);
    }
  }
  // Alt text is what the gather wrote the file's own title into, so it is where
  // a place that slipped the filter shows up.
  const alts = [post.imageAlt ?? "", ...[...post.content.matchAll(/!\[([^\]]*)\]/g)].map((m) => m[1])];
  for (const alt of alts) {
    if (alt && looksLikePlace(alt)) reasons.push(`a picture captioned "${alt.slice(0, 60)}" is a place, not a person`);
    // "A cropped version of File:Johnny Depp (3).jpg" went out as alt text on a
    // published piece. `Post_image_needs_alt` is satisfied — it is not blank —
    // and it still tells a reader who cannot see the photograph nothing at all.
    if (/\bfile:|\bcropped version of\b|\.(jpe?g|png|webp|gif)\b/i.test(alt)) {
      reasons.push(`a picture is described as a file ("${alt.slice(0, 60)}"), not as what it shows`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

async function main() {
  say(`── lane start · want ${COUNT} · ${PUBLISH ? "publishing" : "holding at draft"}${DRY ? " · dry" : ""}`);
  const seen = await history();
  say(`   history: ${seen.titles.length} post(s), ${seen.urls.size} cited URL(s)`);

  const candidates = await gatherCandidates(seen);
  say(`   ${candidates.length} unseen story/stories across ${BEATS.length} beat(s)`);
  // The whole list, in shelf-spread order — not a shortlist. The pre-flight is
  // harsh on purpose (a first run took two of eighteen), so cutting the queue
  // to the target means reporting six and publishing two.
  const shortlist = pickSpread(candidates, candidates.length);

  let written = 0;
  let published = 0;
  const held: string[] = [];
  /** How many pieces each shelf has filed this run, so the byline alternates. */
  const filed = new Map<string, number>();

  for (const candidate of shortlist) {
    if (written >= COUNT) break;
    const query = storyQuery(candidate.topic);
    const news: Article[] = await latestNews(query, 8);
    if (news.length < MIN_OUTLETS) {
      say(`   skip · ${news.length} outlet(s) · ${query}`);
      continue;
    }
    const people = await resolvePeople(candidate.topic);
    if (people.length === 0) {
      say(`   skip · names nobody we have a page for · ${candidate.topic.slice(0, 70)}`);
      continue;
    }
    // The lead subject is the one the piece is about; a supporting name
    // appearing twice in a fortnight is ordinary, a second piece on the same
    // face is not coverage.
    const lead = people[0];
    // Full name, not `namedInProse`: its surname fallback is right for "does
    // this piece name its own subject" and wrong here, where one fortnight of
    // prose contains "Lee" and "Kim" many times over and would rest half of
    // Korean cinema.
    const namedRecently = seen.recentLeads.toLowerCase().includes(lead.name.toLowerCase());
    if (seen.rested.has(lead.slug) || namedRecently) {
      say(`   skip · ${lead.slug} ran within ${SUBJECT_REST_DAYS} days · ${candidate.topic.slice(0, 60)}`);
      continue;
    }
    const films = await resolveFilms(candidate.topic);
    const bench = DESK_BY_SHELF[candidate.category];
    const n = filed.get(candidate.category) ?? 0;
    const byline = bench.length ? bench[n % bench.length] : null;

    say(
      `   take · ${candidate.category} · ${news.length} outlet(s) · by ${byline ?? "the house"} · ` +
        `${people.map((p) => p.slug).join(",")}${films.length ? ` · films ${films.join(",")}` : ""} · ` +
        candidate.topic.slice(0, 70),
    );
    // The rest list came out of the database once, at start-up, and nothing put
    // this run's own work back into it — so the sixth piece could lead with the
    // subject of the first, which is the fortnight rule failing inside a single
    // morning. Recorded at the take rather than after the write, because a dry
    // run is how a person decides to turn the cron on: a plan promising six
    // pieces, two of them about one actor, is not the plan the real run would
    // follow. What that costs when a generation then fails is one further story
    // about that person, this run only.
    for (const person of people) seen.rested.add(person.slug);
    seen.recentLeads += `\n\n${candidate.topic}`;
    if (DRY) {
      written++;
      continue;
    }

    const before = new Set((await prisma.post.findMany({ select: { slug: true } })).map((p) => p.slug));
    try {
      run("publish-topic.ts", [
        // The trimmed query finds the coverage; the headline is the steer.
        `--topic=${query}`,
        `--angle=${candidate.topic}`,
        `--category=${candidate.category}`,
        ...(byline ? [`--byline=${byline}`] : []),
        `--people=${people.map((p) => p.slug).join(",")}`,
        ...(films.length ? [`--films=${films.join(",")}`] : []),
        "--news=8",
        "--images=6",
      ]);
    } catch (e) {
      // codex out of quota, a gather that found nothing, a schema refusal —
      // all of them are one story lost, not a lane that stops.
      say(`   FAILED · ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      continue;
    }
    const created = (
      await prisma.post.findMany({
        where: { slug: { notIn: [...before] } },
        select: { slug: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      })
    )[0];
    if (!created) {
      say("   FAILED · nothing was written");
      continue;
    }
    written++;
    // Counted only on a piece that exists, so a failed generation does not
    // silently skip a critic's turn.
    filed.set(candidate.category, n + 1);

    const verdict = await verify(created.slug);
    if (!verdict.ok) {
      held.push(created.slug);
      say(`   HELD /blog/${created.slug} · ${verdict.reasons.join("; ")}`);
      continue;
    }
    if (!PUBLISH) {
      held.push(created.slug);
      say(`   draft /blog/${created.slug} · clean, held by --no-publish`);
      continue;
    }
    try {
      run("publish-post.ts", [created.slug]);
      published++;
      say(`   LIVE /blog/${created.slug}`);
    } catch (e) {
      held.push(created.slug);
      say(`   HELD /blog/${created.slug} · publish refused: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }

  say(`── lane end · ${written} written · ${published} live · ${held.length} held`);
  for (const slug of held) say(`   held: /blog/${slug}`);
}

main()
  .catch((e) => {
    say(`── lane aborted · ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
