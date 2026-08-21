import { prisma } from "@cinepixo/db";
import type { PostInput } from "@cinepixo/shared";
import { ApiError } from "./api";
import { isOurObjectUrl } from "./media/storage";
import {
  bodyPictureCount,
  DEFAULT_MIN_POST_PICTURES,
  minimumPictureMessage,
  postPictureCount,
} from "./post-visuals";

/**
 * The columns a post write sets, and the one rule the caller must not guess at.
 *
 * `publishedAt` is paired with `status` by a CHECK constraint
 * (`Post_published_has_date`): PUBLISHED carries a date, DRAFT carries none. So
 * the pairing is decided here, once, rather than in each handler:
 *
 *  · publishing something that was never published stamps it now
 *  · re-saving something already published keeps its original date — the piece
 *    was published then, and moving the timestamp on every typo fix would
 *    reorder the feed and lie to the sitemap
 *  · un-publishing clears the date, because the constraint requires it
 *
 * Shared by the create and update handlers so a draft cannot acquire a date, or
 * a published post lose one, depending on which route was taken.
 */
export function postWriteData(input: PostInput, existingPublishedAt: Date | null) {
  return {
    slug: input.slug,
    title: input.title,
    dek: input.dek ?? null,
    content: input.content,
    category: input.category,
    format: input.format,
    methodNote: input.methodNote ?? null,
    disclosure: input.disclosure ?? null,
    correctionNote: input.correctionNote ?? null,
    status: input.status,
    publishedAt:
      input.status === "PUBLISHED" ? (existingPublishedAt ?? new Date()) : null,
    tags: input.tags,
    sources: input.sources,
    image: input.image ?? null,
    imageAlt: input.imageAlt ?? null,
    imageCredit: input.imageCredit ?? null,
    imageLicense: input.imageLicense ?? null,
    imageLicenseUrl: input.imageLicenseUrl ?? null,
    imageSourceUrl: input.imageSourceUrl ?? null,
  };
}

/**
 * Refuses a hero that is not ours before the CHECK constraint has to.
 *
 * `postInputSchema` cannot answer this: which hosts count as ours depends on
 * `S3_PUBLIC_URL`, which only the web app has. Without this the editor's error
 * for a pasted press-photo URL would be a 500 from
 * `Post_image_is_ours` — technically safe, unreadable in practice.
 */
export function assertHeroIsOurs(input: Pick<PostInput, "image">): void {
  if (input.image && !isOurObjectUrl(input.image)) {
    throw new ApiError(
      400,
      "A hero image has to be uploaded here, not linked from somewhere else",
    );
  }
}

export function assertPostPictureFloor(
  input: Pick<PostInput, "content" | "image" | "status">,
): void {
  if (input.status !== "PUBLISHED") return;
  const total = postPictureCount(input.content, input.image);
  const body = bodyPictureCount(input.content);
  if (!input.image || total < DEFAULT_MIN_POST_PICTURES || body < DEFAULT_MIN_POST_PICTURES - 1) {
    throw new ApiError(400, minimumPictureMessage(total, DEFAULT_MIN_POST_PICTURES));
  }
}

/**
 * Replaces what a post is about, wholesale.
 *
 * Assignment is curation, not append — the editor hands over the whole list in
 * the order it should read, so the rows are rewritten in one transaction with
 * `sort` taken from array position. Same contract as a topic's film list, and
 * for the same reason: `createdAt` is transaction-scoped, so ordering by it
 * would give every row the same timestamp.
 */
export async function syncPostSubjects(
  postId: string,
  input: Pick<PostInput, "personIds" | "movieIds">,
) {
  await prisma.$transaction([
    prisma.postPerson.deleteMany({ where: { postId } }),
    prisma.postMovie.deleteMany({ where: { postId } }),
    prisma.postPerson.createMany({
      data: input.personIds.map((personId, sort) => ({ postId, personId, sort })),
    }),
    prisma.postMovie.createMany({
      data: input.movieIds.map((movieId, sort) => ({ postId, movieId, sort })),
    }),
  ]);
}
