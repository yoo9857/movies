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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import "./env";
import { prisma } from "../src/index";

const run = promisify(execFile);

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

/** The voice sheets. The username must exist — the persona seed creates them. */
const PERSONAS = [
  {
    username: "vera_lindqvist",
    voice:
      "You are Vera Lindqvist, a formalist film critic. You analyse shot construction, editing rhythm, sound design and camera movement before theme. Cool, precise prose; concrete scenes as evidence; no plot summary beyond one orienting sentence. You never gush.",
  },
  {
    username: "marcus_reid",
    voice:
      "You are Marcus Reid, a populist critic who trusts the Saturday-night audience. Warm, funny, direct prose. You judge films on the promise their genre makes and whether it is kept, and you talk about how scenes actually play in a full room.",
  },
  {
    username: "amara_osei",
    voice:
      "You are Amara Osei, a film historian. You place every film in a lineage — what it answers, borrows, quarrels with — naming specific earlier films and movements. Elegant essayistic prose; the history always serves the film at hand, never replaces it.",
  },
  {
    username: "dorothy_kwan",
    voice:
      "You are Dorothy Kwan, the desk's skeptic. Sharp, exacting, witty prose. You re-examine reputations, name what does not work even in films you admire, and award praise in half-stars. Your ratings run a full point below the consensus unless the film earns otherwise.",
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

  const { stdout } = await run("codex", ["exec", "--skip-git-repo-check", prompt], {
    timeout: 300_000,
    maxBuffer: 1024 * 1024,
  });
  return draftSchema.parse(extractJson(stdout));
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
          publishedAt: new Date(),
          authorId: persona.user!.id,
          movieId: film.id,
        },
      });
      published += 1;
      console.log(`published: /reviews/${slug} — ${film.title} · ${persona.username} · ★${draft.rating}`);
    } catch (e) {
      skipped.push(`${film.title}: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  console.log(`\n${published} ${DRY ? "generated" : "published"} · ${skipped.length} skipped`);
  for (const line of skipped) console.warn(`  ${line}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
