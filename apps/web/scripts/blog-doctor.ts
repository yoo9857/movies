// What the constraints cannot check: whether the pictures a post points at
// actually load, and whether the obligations that travel with them are intact.
//
//   cd apps/web && npx tsx scripts/blog-doctor.ts
//   npx tsx scripts/blog-doctor.ts --post=<slug>     # one piece
//   npx tsx scripts/blog-doctor.ts --fetch           # also HEAD every object
//   npm run blog-doctor -- --fetch                   # from the repo root
//
// This exists because of a real failure. Seven photographs were uploaded to a
// shared bucket without the path prefix its public URL carries. Every PUT
// succeeded, every URL was well-formed, `Post_image_is_ours` passed — it only
// inspects the string — and all seven 404'd on the live page. Nothing in the
// pipeline was positioned to notice, because the thing that was wrong was the
// relationship between two systems rather than a value in either.
//
// So the checks here are the ones a CHECK constraint cannot express:
//
//   · a hero URL that answers 404 (the failure above)
//   · a body picture that answers 404
//   · a hero with no alt text — the schema says we cannot ship one, and
//     nothing enforces it, so this is where that promise is kept
//   · a picture whose licence is named with no source to check it against
//   · a published PEOPLE or ISSUE piece with no citations (belt and braces:
//     the database refuses this, so a hit means something bypassed it)
//   · a picture URL that is not ours at all
//
// `--fetch` is off by default: a run over the whole blog with it on is one
// request per picture to our own bucket, which is fine occasionally and rude
// as a habit. Without it the network is never touched and only the shape of
// the data is judged.
import "../../../packages/db/prisma/env";
import { prisma } from "@cinepixo/db";
import { auditPostQuality } from "@cinepixo/shared";
import { isOurObjectUrl } from "@/lib/media/storage";
import { DEFAULT_MIN_POST_PICTURES, minimumPictureMessage } from "@/lib/post-visuals";

function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const ONE = strArg("post");
const FETCH = process.argv.includes("--fetch");
const SOURCED = new Set(["PEOPLE", "ISSUE"]);

interface Problem {
  slug: string;
  /** "error" fails the run; "warning" is reported and tolerated. */
  level: "error" | "warning";
  what: string;
}

/** Every `![alt](url)` in a body, with its alt. */
function bodyPictures(content: string): { url: string; alt: string }[] {
  return [...content.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)].map((m) => ({
    alt: m[1],
    url: m[2],
  }));
}

async function reachable(url: string): Promise<boolean> {
  // Relative paths are served by this app; judging them needs a running
  // server, which a data check should not require.
  if (url.startsWith("/")) return true;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "CinePixo/1.0 (+https://cinepixo.com)" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const posts = await prisma.post.findMany({
    where: ONE ? { slug: ONE } : {},
    orderBy: { createdAt: "asc" },
    select: {
      slug: true,
      status: true,
      category: true,
      format: true,
      methodNote: true,
      disclosure: true,
      content: true,
      dek: true,
      title: true,
      tags: true,
      sources: true,
      image: true,
      imageAlt: true,
      imageCredit: true,
      imageLicense: true,
      imageSourceUrl: true,
      people: { select: { personId: true } },
      movies: { select: { movieId: true } },
      author: { select: { bio: true } },
    },
  });
  if (posts.length === 0) throw new Error(ONE ? `no post with slug ${ONE}` : "no posts");

  console.log(`Checking ${posts.length} post(s)${FETCH ? ", fetching every object" : ""}…\n`);

  const problems: Problem[] = [];
  let pictures = 0;

  for (const post of posts) {
    const say = (level: Problem["level"], what: string) =>
      problems.push({ slug: post.slug, level, what });

    const body = bodyPictures(post.content);
    const postPictures = body.length + (post.image ? 1 : 0);
    if (
      !post.image ||
      postPictures < DEFAULT_MIN_POST_PICTURES ||
      body.length < DEFAULT_MIN_POST_PICTURES - 1
    ) {
      say("error", minimumPictureMessage(postPictures, DEFAULT_MIN_POST_PICTURES));
    }

    if (post.image) {
      pictures += 1;
      if (!isOurObjectUrl(post.image)) say("error", `hero is not ours: ${post.image}`);
      // The schema comment promises this and no constraint keeps it. A picture
      // with no alt is invisible to a reader who cannot see it, and the page
      // renders alt="" — indistinguishable from "deliberately decorative".
      if (!post.imageAlt?.trim()) say("error", "hero has no alt text");
      if (post.imageLicense && !post.imageSourceUrl) {
        say("error", "hero states a licence with no source to check it against");
      }
      if (!post.imageCredit && post.imageLicense) {
        say("warning", `hero is ${post.imageLicense} with no credit line`);
      }
      if (FETCH && !(await reachable(post.image))) {
        say("error", `hero does not load: ${post.image}`);
      }
    }

    for (const pic of body) {
      pictures += 1;
      if (!isOurObjectUrl(pic.url)) say("error", `body picture is not ours: ${pic.url}`);
      if (!pic.alt.trim()) say("warning", `body picture has no alt text: ${pic.url}`);
      if (FETCH && !(await reachable(pic.url))) {
        say("error", `body picture does not load: ${pic.url}`);
      }
    }

    if (post.status === "PUBLISHED" && SOURCED.has(post.category) && post.sources.length === 0) {
      // The database refuses this. Reaching it means something wrote around it.
      say("error", `published ${post.category} with no sources`);
    }

    for (const issue of auditPostQuality({
      title: post.title,
      dek: post.dek ?? undefined,
      content: post.content,
      format: post.format,
      methodNote: post.methodNote ?? undefined,
      disclosure: post.disclosure ?? undefined,
      sources: post.sources,
      tags: post.tags,
      personIds: post.people.map((p) => p.personId),
      movieIds: post.movies.map((m) => m.movieId),
    })) {
      say(issue.level, issue.message);
    }
    if (post.status === "PUBLISHED" && !post.author.bio?.trim()) {
      say("error", "published byline has no writer biography");
    }
  }

  const errors = problems.filter((p) => p.level === "error");
  const warnings = problems.filter((p) => p.level === "warning");

  for (const group of [errors, warnings]) {
    for (const p of group) {
      console.log(`  ${p.level === "error" ? "FAIL" : "warn"}  /blog/${p.slug}\n        ${p.what}`);
    }
  }

  console.log(
    `\n${pictures} picture(s) across ${posts.length} post(s) · ${errors.length} error(s) · ${warnings.length} warning(s)`,
  );
  if (!FETCH) console.log("Pass --fetch to also prove every object actually loads.");
  if (errors.length > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
