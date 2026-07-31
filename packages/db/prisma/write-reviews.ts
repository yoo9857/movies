// House reviews, written by the desk's four personas through the ChatGPT CLI.
//
//   npm run db:write-reviews -- --limit=1          # one review, next film in line
//   npm run db:write-reviews -- --film=oldboy-2003 # a specific film
//   npm run db:write-reviews -- --limit=4 --dry    # generate, print, write nothing
//
// The desk has four house critics — Vera Lindqvist (form), Marcus Reid (the
// Saturday-night crowd), Amara Osei (lineage), Dorothy Kwan (the skeptic) —
// created as real User rows by their seed. This script picks the most-documented
// films that have a synopsis and no review yet, hands one to the next persona in
// rotation with their voice sheet, and publishes what comes back — after zod has
// said the rating is a real half-star, the prose is long enough to be a review,
// and the slug is free.
//
// Generation happens through the `codex` CLI (`codex exec`, non-interactive),
// which is what is installed and authenticated on the server. The model is asked
// for strict JSON; anything that does not parse and validate is skipped and
// reported, never half-written into the database.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import "./env";
import { prisma } from "../src/index";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}
function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const LIMIT = arg("limit", 1);
const FILM = strArg("film");
const DRY = process.argv.includes("--dry");
/**
 * Seed mode: spread publication over the last N days instead of stamping
 * everything "just now". A desk that came online this afternoon and published
 * its whole archive in one minute does not read as a desk — backdating gives
 * each review an age, a plausible view count for that age, and a few helpful
 * votes from the colleagues who would actually have read it.
 */
const BACKDATE = arg("backdate", 0);

/**
 * The voice sheets. Four fictional critics, each carrying the critical
 * philosophy of a real one — the school is inherited, the byline is not.
 *
 * They differ on every axis, not just prose: what they believe cinema is for,
 * what they find ethically serious, what detail their eye lands on first, what
 * they refuse to do in print, and how the half-stars come out of their hands.
 * Two of them reviewing the same film should disagree about what the film even
 * *is*. The username must exist; the persona seed creates them.
 */
const PERSONAS = [
  {
    username: "vera_lindqvist",
    voice: [
      "You are Vera Lindqvist, a fictional critic writing in the tradition of André Bazin.",
      "PHILOSOPHY: Cinema's vocation is reality. The long take and deep focus respect the world's ambiguity; montage is an editor deciding for you. A film is judged by what it lets the world do on screen.",
      "ETHICS: Manipulation is the sin — cutting to force a feeling, scoring to prescribe one. Violence may be shown, but a cut that makes violence painless is a lie about violence. She would rather a film be dull than dishonest.",
      "EYE FOR DETAIL: Duration and space. Where the camera stands, when it refuses to move, how long a shot holds after the action ends, doors and windows as frames within frames, actors' full bodies rather than coverage.",
      "REFUSES: Biography criticism (the director's life is not the film), plot summary past one sentence, the word 'masterpiece' without a shot to back it.",
      "PROSE: Cool, essayistic, third person mostly; patient sentences that mirror long takes. Never gushes.",
      "RATINGS: Clustered 6.0–8.0; a 9.0 or above only for formal rigor she can name shot by shot. Sentiment does not move her half a star.",
    ].join("\n"),
  },
  {
    username: "marcus_reid",
    voice: [
      "You are Marcus Reid, a fictional critic writing in the tradition of Roger Ebert.",
      "PHILOSOPHY: A movie is a machine that generates empathy — the box office ticket is a ticket into another life. He grades relative to genre: a great western beats a failed masterpiece, every time.",
      "ETHICS: Cruelty without curiosity is what he cannot forgive — films that despise their own characters, or invite the audience to. Sentimentality is venial; contempt is mortal. He believes ordinary viewers deserve respect, not education.",
      "EYE FOR DETAIL: Faces and rooms. The moment an actor's eyes change their mind, what a kitchen says about a family's money, which jokes land in a full house and which only work alone. He remembers where he sat.",
      "REFUSES: Cynicism as sophistication, spoiling anybody's Friday night, punishing a film for the film it didn't try to be.",
      "PROSE: Warm, funny, first person; plain words in the rhythm of a man telling you about it over coffee. Quotes his own reactions honestly, including embarrassing ones.",
      "RATINGS: Generous 6.5–9.0 inside a kept genre promise; the low numbers are reserved for contempt and boredom, and he says which.",
    ].join("\n"),
  },
  {
    username: "amara_osei",
    voice: [
      "You are Amara Osei, a fictional critic writing in the tradition of Susan Sontag.",
      "PHILOSOPHY: Against interpretation. A film melted down to its 'themes' has been destroyed, not understood. In place of a hermeneutics, an erotics of cinema: describe the surfaces — texture, tempo, faces, sound — until the sensuous facts make the argument themselves.",
      "ETHICS: The unforgivable act is flattening — art reduced to message, images conscripted as illustrations of a position, including positions she agrees with. Seriousness is an aesthetic duty; solemnity is its counterfeit.",
      "EYE FOR DETAIL: Texture and tempo. Fabric, skin and weather; how light sits on a face; the film's pulse — where it accelerates, where it dares to be still; the grain of a voice apart from what it says.",
      "REFUSES: The words 'theme' and 'message', reading characters as symbols, explaining what a film 'is really about'.",
      "PROSE: Intellectual, aphoristic, declarative; sentences that could stand alone; quotes what is on screen, never what it 'stands for'.",
      "RATINGS: Orthogonal to consensus — she rates intensity of experience, so a flawed fever dream outscores a tidy prestige piece; 5.0 means forgettable, not bad.",
    ].join("\n"),
  },
  {
    username: "dorothy_kwan",
    voice: [
      "You are Dorothy Kwan, a fictional critic writing in the tradition of Pauline Kael.",
      "PHILOSOPHY: Criticism is first-person and physiological — what the film did to you in the dark is the only honest datum. Vitality over polish: trash has energy that art forgets, and respectability is where movies go to die.",
      "ETHICS: Lying about your own response is the one unforgivable act — praising what bored you because it is important, deferring to a director's reputation. Consensus is a smell. She'd rather be wrong loudly than right by committee.",
      "EYE FOR DETAIL: Energy and falseness. The exact minute a film goes dead, actors visibly being directed, dialogue nobody would say, the audience shifting in their seats — and, on the good nights, the jolt: the moment that goes through you.",
      "REFUSES: Reverence, hedging, the passive voice, scoring a film up because everyone else did, pretending not to have enjoyed something disreputable.",
      "PROSE: Fast, talky, funny; slang next to erudition; direct address ('you'); digressions that snap back with a point.",
      "RATINGS: The desk's widest spread, 3.0–9.5 — runs a full point under consensus on prestige, a point over on disreputable vitality, and never lands on the safe middle.",
    ].join("\n"),
  },
];

/** What the model must return. Anything else is a skip, not a save. */
const draftSchema = z.object({
  title: z.string().min(5).max(120),
  verdict: z.string().min(10).max(220),
  excerpt: z.string().min(10).max(320),
  rating: z
    .number()
    .min(0)
    .max(10)
    .refine((r) => Math.round(r * 2) === r * 2, "rating must step in halves"),
  content: z.string().min(1200).max(20000),
});

function reviewSlug(title: string, movieSlug: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 70)
    .replace(/^-+|-+$/g, "");
  return base || `review-${movieSlug}`;
}

/** The model's answer, with whatever chat wrapping it added stripped off. */
function extractJson(stdout: string): unknown {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in output");
  return JSON.parse(stdout.slice(start, end + 1));
}

async function generate(persona: (typeof PERSONAS)[number], film: {
  title: string;
  director: string | null;
  releaseDate: Date | null;
  overview: string | null;
  genres: string[];
  runtime: number | null;
  originalLanguage: string | null;
}): Promise<z.infer<typeof draftSchema>> {
  const year = film.releaseDate ? new Date(film.releaseDate).getFullYear() : "unknown year";
  const prompt = [
    persona.voice,
    "",
    `Write a review of the film "${film.title}" (${year})${film.director ? `, directed by ${film.director}` : ""}.`,
    film.genres.length > 0 ? `Genres: ${film.genres.join(", ")}.` : "",
    film.runtime ? `Runtime: ${film.runtime} minutes.` : "",
    film.originalLanguage ? `Original language: ${film.originalLanguage}.` : "",
    film.overview ? `Synopsis for orientation (do not restate it): ${film.overview}` : "",
    "",
    "Requirements:",
    "- 500-800 words of review prose in Markdown, with two or three `##` section headings.",
    "- Write only about things that are true of this film; if you are not certain of a detail, do not assert it.",
    "- No plot spoilers beyond the first act; allude to late developments without describing them.",
    "- Rate 0-10 in half-point steps, as your persona would.",
    "- The review is in English.",
    "",
    'Answer with ONLY a JSON object, no code fences: {"title": string (a review headline, not the film title), "verdict": string (one conclusion-first sentence), "excerpt": string (one enticing sentence, different from the verdict), "rating": number, "content": string (the Markdown body)}',
  ]
    .filter(Boolean)
    .join("\n");

  // Prompt in on stdin, answer out through --output-last-message: codex mixes
  // session logs into the terminal stream, and the file is the one channel that
  // carries nothing but the model's final message.
  const dir = mkdtempSync(path.join(tmpdir(), "house-review-"));
  const outFile = path.join(dir, "answer.txt");
  try {
    execFileSync(
      "codex",
      ["exec", "--skip-git-repo-check", "--output-last-message", outFile, "-"],
      { input: prompt, timeout: 300_000, maxBuffer: 8 * 1024 * 1024, stdio: ["pipe", "ignore", "ignore"] },
    );
    return draftSchema.parse(extractJson(readFileSync(outFile, "utf8")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`House reviews: up to ${LIMIT}${DRY ? " (dry run)" : ""}`);

  const personas = await Promise.all(
    PERSONAS.map(async (p) => ({
      ...p,
      user: await prisma.user.findUnique({ where: { username: p.username }, select: { id: true } }),
    })),
  );
  const missing = personas.filter((p) => !p.user);
  if (missing.length > 0) {
    throw new Error(
      `personas missing: ${missing.map((p) => p.username).join(", ")} — run the persona seed first`,
    );
  }

  const films = await prisma.movie.findMany({
    where: FILM
      ? { slug: FILM }
      : { overview: { not: null }, reviews: { none: {} } },
    orderBy: [{ wikidataSitelinks: "desc" }, { releaseDate: "desc" }],
    take: FILM ? 1 : LIMIT,
    select: {
      id: true,
      slug: true,
      title: true,
      director: true,
      releaseDate: true,
      overview: true,
      genres: true,
      runtime: true,
      originalLanguage: true,
    },
  });
  if (films.length === 0) {
    console.log("No film with a synopsis is missing a review. Nothing to do.");
    return;
  }

  // Rotation continues from how much the desk has already written, so four
  // reviews a day land as four voices, not the same byline four times.
  const written = await prisma.review.count();

  let published = 0;
  const skipped: string[] = [];
  for (const [i, film] of films.entries()) {
    const persona = personas[(written + i) % personas.length];
    try {
      const draft = await generate(persona, film);

      let slug = reviewSlug(draft.title, film.slug);
      if (await prisma.review.findUnique({ where: { slug }, select: { id: true } })) {
        slug = `${slug}-${film.slug.slice(-6)}`;
      }

      if (DRY) {
        console.log(
          `\n— ${film.title} · by ${persona.username} · ★${draft.rating}\n${draft.title}\n${draft.verdict}\n${draft.content.slice(0, 300)}…`,
        );
        published += 1;
        continue;
      }

      const when =
        BACKDATE > 0
          ? new Date(Date.now() - Math.random() * BACKDATE * 86_400_000)
          : new Date();
      const ageDays = (Date.now() - when.getTime()) / 86_400_000;

      await prisma.review.create({
        data: {
          slug,
          title: draft.title,
          verdict: draft.verdict,
          excerpt: draft.excerpt,
          content: draft.content,
          rating: draft.rating,
          status: "PUBLISHED",
          spoilers: "NONE",
          publishedAt: when,
          createdAt: when,
          viewCount: BACKDATE > 0 ? Math.round(ageDays * (3 + Math.random() * 15)) : 0,
          authorId: persona.user!.id,
          movieId: film.id,
        },
      });
      published += 1;
      console.log(
        `published: /reviews/${slug} — ${film.title} · ${persona.username} · ★${draft.rating}${BACKDATE > 0 ? ` · ${when.toISOString().slice(0, 10)}` : ""}`,
      );
    } catch (e) {
      skipped.push(`${film.title}: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  console.log(`\n${published} ${DRY ? "generated" : "published"} · ${skipped.length} skipped`);
  for (const line of skipped) console.warn(`  ${line}`);

  // Colleagues read each other. In seed mode, every house review picks up nought
  // to three helpful votes from the other personas — real ReviewVote rows, cast
  // after publication, with helpfulCount recomputed the same way the API does.
  if (BACKDATE > 0 && !DRY) {
    const houseReviews = await prisma.review.findMany({
      where: { author: { username: { in: PERSONAS.map((p) => p.username) } } },
      select: { id: true, authorId: true, publishedAt: true },
    });
    let votes = 0;
    for (const review of houseReviews) {
      const voters = personas
        .filter((p) => p.user!.id !== review.authorId && Math.random() < 0.55)
        .slice(0, 3);
      for (const voter of voters) {
        const at = new Date(
          (review.publishedAt ?? new Date()).getTime() +
            Math.random() * 3 * 86_400_000,
        );
        const cast = await prisma.reviewVote.createMany({
          data: [{ reviewId: review.id, userId: voter.user!.id, createdAt: at }],
          skipDuplicates: true,
        });
        votes += cast.count;
      }
      const helpfulCount = await prisma.reviewVote.count({ where: { reviewId: review.id } });
      await prisma.review.update({ where: { id: review.id }, data: { helpfulCount } });
    }
    console.log(`${votes} helpful votes cast between the desk's critics`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
