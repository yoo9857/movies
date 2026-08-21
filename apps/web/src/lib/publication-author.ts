import { prisma } from "@cinepixo/db";
import type { ReviewStatus } from "@cinepixo/shared";
import { ApiError } from "./api";

/** A public review or feature byline must resolve to an accountable profile. */
export async function assertPublishingAuthor(
  authorId: string,
  status: ReviewStatus,
): Promise<void> {
  if (status !== "PUBLISHED") return;
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { bio: true },
  });
  if (!author?.bio?.trim()) {
    throw new ApiError(
      400,
      "Complete the writer biography in profile settings before publishing",
    );
  }
}
