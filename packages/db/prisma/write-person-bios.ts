// A biography for a person, written by a person, landed from a job file.
//
//   npm run db:person-bios -- --dry --jobs=deploy-jobs/person-bios.json
//   npm run db:person-bios -- --jobs=deploy-jobs/person-bios.json
//
// The companion to `write-person-notes.ts`, and deliberately the opposite kind
// of program. That one *composes* `notes` from rows this database holds, which
// is safe to do at scale precisely because nothing in it is recalled. This one
// writes `bio`, which cannot be derived from anything — so it does not try. It
// carries prose someone wrote from sources they read, checks it, and stores it.
//
// Why `bio` is worth the separate trouble: `pageMetadata` uses it as the page's
// meta **description** (`(site)/people/[slug]/page.tsx`). Every other field on a
// person page is rendered for a reader; this one is also the sentence Google
// prints under the link. On 2026-08-20 the Search Console report showed the site
// taking 135 impressions at position 5.3 for one imported person page and 80
// across three queries for another, with zero clicks on either. Ranking was
// never the problem. There was no description to click.
//
// Rules, in the order they bite:
//
//  · **The prose travels in a job file, not in this script.** `deploy-jobs/`
//    keeps the text reconstructable without hand-editing database rows — the
//    same reason the blog's drafts live there.
//  · **Fill-only.** A person who already has a bio is skipped, never
//    overwritten. Nothing hand-written is at risk from a re-run.
//  · **Every job names its sources.** They are not stored — `Person` has no
//    column for them and a bio is not a claim-by-claim citation — but a job
//    without them is refused, because a biography assembled from a model's
//    memory of a real person is how a reference page acquires a confident
//    falsehood about someone who can be harmed by it.
//  · **Length is checked at both ends.** Under 120 characters is not a
//    biography; over 400 stops working as a description and gets truncated
//    mid-sentence in a result.
//  · **It refuses a bio that merely restates the notes.** If the two would say
//    the same thing, the second one is padding, and padding at scale is what
//    Google's scaled-content policy is about.
import "./env";
import { readFileSync } from "node:fs";
import { prisma } from "../src/index";
import { jobFile } from "./job-file";

const args = process.argv.slice(2);
const has = (n: string) => args.includes(`--${n}`);
const val = (n: string) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};

const DRY = has("dry");
const JOBS = val("jobs");

const MIN_LEN = 120;
const MAX_LEN = 400;

interface Job {
  slug: string;
  bio: string;
  sources: string[];
}

/**
 * Do the bio and the note carry the same information?
 *
 * Not string equality — they will never be equal. The question is whether the
 * bio adds anything, so this asks how much of its vocabulary the note already
 * has. The composed notes are built from titles, job nouns and counts, so a bio
 * that is also just titles and counts scores high and is refused.
 */
function overlapsNote(bio: string, note: string | null): boolean {
  if (!note) return false;
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const b = words(bio);
  const n = words(note);
  if (b.size === 0) return true;
  let shared = 0;
  for (const w of b) if (n.has(w)) shared += 1;
  return shared / b.size > 0.6;
}

async function main() {
  if (!JOBS) throw new Error("pass --jobs=<file.json> (see the header of this file)");

  const parsed: unknown = JSON.parse(readFileSync(jobFile(JOBS), "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${JOBS} must hold an array of jobs`);
  const jobs = parsed as Job[];

  console.log(`Person bios: ${jobs.length} job(s) from ${JOBS}${DRY ? " · dry run" : ""}\n`);

  let written = 0;
  let skipped = 0;

  for (const job of jobs) {
    const fail = (why: string) => {
      console.log(`- ${job.slug}: ${why}`);
      skipped += 1;
    };

    if (!job.slug || typeof job.bio !== "string") {
      fail("a job needs a slug and a bio");
      continue;
    }
    const bio = job.bio.trim();
    if (!Array.isArray(job.sources) || job.sources.length === 0) {
      fail("no sources — refused");
      continue;
    }
    if (bio.length < MIN_LEN) {
      fail(`${bio.length} characters is not a biography (minimum ${MIN_LEN})`);
      continue;
    }
    if (bio.length > MAX_LEN) {
      fail(`${bio.length} characters will be truncated as a description (maximum ${MAX_LEN})`);
      continue;
    }

    const person = await prisma.person.findUnique({
      where: { slug: job.slug },
      select: { id: true, name: true, bio: true, notes: true },
    });
    if (!person) {
      fail("no such person");
      continue;
    }
    if (person.bio) {
      fail("already has a bio, left alone");
      continue;
    }
    if (overlapsNote(bio, person.notes)) {
      fail("says what the notes already say — refused");
      continue;
    }

    console.log(`${job.slug} — ${person.name}`);
    console.log(`  ${bio}`);
    console.log(`  (${bio.length} chars · ${job.sources.length} source(s))`);

    if (!DRY) {
      // Guarded on `bio: null` as well as the id, so two runs racing cannot
      // overwrite one another.
      const res = await prisma.person.updateMany({
        where: { id: person.id, bio: null },
        data: { bio },
      });
      if (res.count === 0) {
        fail("someone else wrote a bio while this ran");
        continue;
      }
      written += 1;
    }
  }

  const total = jobs.length - skipped;
  console.log(`\n${DRY ? `[dry] would write=${total}` : `wrote=${written}`} skipped=${skipped}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
