// The last step, which is a person's: take a draft live.
//
//   cd apps/web && npx tsx scripts/publish-post.ts <slug>
//   npx tsx scripts/publish-post.ts <slug> --unpublish
//   npx tsx scripts/publish-post.ts <slug> --ping        # resubmit, no status change
//   npx tsx scripts/publish-post.ts <slug> --allow-few-pictures
//
// Separate from everything that writes, because `Post_claims_are_sourced` can
// prove a citation exists and nothing in a database can prove the prose is
// faithful to it. Typing this is how someone says they have read the piece
// against its sources.
//
// It prints what it is about to publish — headline, standfirst, subjects,
// sources, picture count — so the last thing before a piece goes public is a
// look at what the piece actually claims.
import "../../../packages/db/prisma/env";
import { prisma } from "@cinepixo/db";
import { type PostCategory, postCategorySlug } from "@cinepixo/shared";
import { submitUrls } from "@/lib/indexnow";
import {
  DEFAULT_MIN_POST_PICTURES,
  minimumPictureMessage,
  postPictureCount,
} from "@/lib/post-visuals";

const SLUG = process.argv[2];
const UNPUBLISH = process.argv.includes("--unpublish");
/** Resubmit an already-published piece — after an edit, or a first key. */
const PING = process.argv.includes("--ping");
const ALLOW_FEW_PICTURES = process.argv.includes("--allow-few-pictures");

function numArg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a non-negative integer`);
  return value;
}

const MIN_PICTURES = numArg("min-pictures", DEFAULT_MIN_POST_PICTURES);

/**
 * The piece is live at its own URL immediately; the listings that link to it
 * are cached for a minute.
 *
 * Said out loud because the alternative is the author reloading `/blog`, not
 * seeing the piece, and reaching for a restart. A CLI cannot reach into the
 * running server's cache — the admin routes call `revalidateTag` because they
 * are inside it, and this is not.
 */
function noteListingDelay(): void {
  console.log("The piece is live now. /blog and its shelf pick it up within a minute.");
}

/**
 * Tell the search engines that take being told.
 *
 * The piece, the blog front, and the shelf it landed on — the three URLs whose
 * content actually changed. Never the sitemap: IndexNow wants pages, and a
 * crawler finds the sitemap from robots.txt anyway.
 *
 * Google is not among them and cannot be; see `lib/indexnow.ts`. The message
 * says so rather than letting a green line imply otherwise.
 */
async function tellSearchEngines(slug: string, category: PostCategory): Promise<void> {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) {
    console.log("NEXT_PUBLIC_SITE_URL is not set — skipped the IndexNow submission");
    return;
  }
  const urls = [
    new URL(`/blog/${slug}`, site).href,
    new URL("/blog", site).href,
    new URL(`/blog/category/${postCategorySlug(category)}`, site).href,
  ];
  const { ok, detail } = await submitUrls(urls, site);
  console.log(`IndexNow (Bing, Yandex, Seznam, Naver): ${detail}`);
  if (ok) {
    console.log(
      "Google takes no such ping. It will find this through the sitemap and the\n" +
        "subject pages that link to it; to hurry it, use Request Indexing in Search Console.",
    );
  }
}

async function main() {
  if (!SLUG || SLUG.startsWith("--")) throw new Error("usage: publish-post.ts <slug> [--unpublish]");

  const post = await prisma.post.findUnique({
    where: { slug: SLUG },
    select: {
      id: true, slug: true, title: true, dek: true, status: true, category: true, content: true,
      sources: true, image: true, imageCredit: true, imageLicense: true,
      people: { orderBy: { sort: "asc" }, select: { person: { select: { slug: true } } } },
      movies: { orderBy: { sort: "asc" }, select: { movie: { select: { slug: true } } } },
    },
  });
  if (!post) throw new Error(`no post with slug ${SLUG}`);

  if (UNPUBLISH) {
    // publishedAt must go with it: Post_published_has_date refuses a DRAFT
    // that still carries a date.
    await prisma.post.update({
      where: { id: post.id },
      data: { status: "DRAFT", publishedAt: null },
    });
    console.log(`back to draft: /blog/${post.slug}`);
    return;
  }

  console.log(`${post.title}\n${post.dek ?? ""}\n`);
  console.log(`  section    ${post.category}`);
  console.log(`  subjects   ${[...post.people.map((p) => p.person.slug), ...post.movies.map((m) => m.movie.slug)].join(", ") || "none"}`);
  console.log(`  sources    ${post.sources.length}`);
  for (const s of post.sources) console.log(`             ${s}`);
  const bodyPictures = (post.content.match(/!\[/g) ?? []).length;
  const pictures = postPictureCount(post.content, post.image);
  console.log(`  pictures   ${bodyPictures} in the body, hero ${post.image ? "set" : "MISSING"} (${pictures} total)`);
  if (post.image && !post.imageCredit) console.log("             hero has no credit line");
  if (post.image && !post.imageLicense) console.log("             hero states no licence (fine for our own file)");

  if (post.status === "PUBLISHED") {
    if (PING) {
      // The piece did not change status, but something about it did — an edit,
      // or a key that did not exist when it went live.
      await tellSearchEngines(post.slug, post.category);
      return;
    }
    console.log("\nalready published — nothing to do (--ping to resubmit it)");
    return;
  }

  const pictureLayoutIsShort =
    pictures < MIN_PICTURES ||
    (MIN_PICTURES > 0 && !post.image) ||
    bodyPictures < Math.max(0, MIN_PICTURES - 1);
  if (pictureLayoutIsShort && !ALLOW_FEW_PICTURES) {
    throw new Error(
      minimumPictureMessage(pictures, MIN_PICTURES) +
        `; found ${post.image ? "one hero" : "no hero"} and ${bodyPictures} in the body` +
        ". Add licensed photographs or operator-approved YouTube thumbnails with post-images; " +
        "X and Instagram posts must be embedded. Use --allow-few-pictures only for a deliberate exception.",
    );
  }

  const updated = await prisma.post.update({
    where: { id: post.id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
    select: { slug: true, publishedAt: true },
  });
  console.log(`\nPUBLISHED /blog/${updated.slug} at ${updated.publishedAt?.toISOString()}`);
  console.log("It is now on its shelf, in the sitemap and in the feeds.");
  noteListingDelay();
  await tellSearchEngines(updated.slug, post.category);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
