import { prisma } from "@cinepixo/db";
import { POST_CATEGORY_LABELS } from "@cinepixo/shared";
import { ImageResponse } from "next/og";
import { OG_CONTENT_TYPE, OG_SIZE, PostCard, ogFontOptions, ourImageAsPng } from "@/lib/og-card";
import { hosted } from "@/lib/seo";

// A share card per post, not one image for the whole blog.
export const alt = "A post on the CinePixo blog";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Posts are edited; a card cached against an old headline is worse than the
// render cost of drawing it again.
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const post = await prisma.post.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      title: true,
      dek: true,
      category: true,
      publishedAt: true,
      image: true,
      author: { select: { username: true, displayName: true } },
    },
  });

  // A missing or unpublished post still needs *an* image — the wordmark card is
  // honest and keeps a crawler from getting a 404 where it expects a PNG.
  if (!post) {
    return new ImageResponse(
      PostCard({
        title: "CinePixo",
        dek: "Film writing that isn't a review.",
        section: "Off Camera",
        author: "CinePixo",
      }),
      await ogFontOptions(),
    );
  }

  // Our own hero, re-encoded: satori cannot decode WebP and WebP is what the
  // upload pipeline produces. Null on any failure, which draws the type-only
  // card rather than throwing.
  const hero = post.image ? await ourImageAsPng(hosted(post.image), 660) : null;

  return new ImageResponse(
    PostCard({
      title: post.title,
      dek: post.dek,
      section: POST_CATEGORY_LABELS[post.category],
      author: post.author.displayName ?? post.author.username,
      // Formatted here rather than in the card: this file knows the locale, the
      // renderer only draws glyphs.
      date: post.publishedAt
        ? new Date(post.publishedAt).toLocaleDateString("en-US", { dateStyle: "long" })
        : null,
      hero,
    }),
    await ogFontOptions(),
  );
}
