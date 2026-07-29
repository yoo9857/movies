import { prisma } from "@cinepixo/db";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// Escape user content for XML — feed output must never break out of tags.
function xml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const reviews = await prisma.review.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 20,
    select: {
      slug: true,
      title: true,
      excerpt: true,
      publishedAt: true,
      author: { select: { username: true, displayName: true } },
      movie: { select: { title: true } },
    },
  });

  const items = reviews
    .map((r) => {
      const url = `${SITE_URL}/reviews/${r.slug}`;
      return [
        "    <item>",
        `      <title>${xml(r.title)}</title>`,
        `      <link>${xml(url)}</link>`,
        `      <guid isPermaLink="true">${xml(url)}</guid>`,
        r.excerpt ? `      <description>${xml(r.excerpt)}</description>` : "",
        `      <author>${xml(r.author.displayName ?? r.author.username)}</author>`,
        `      <category>${xml(r.movie.title)}</category>`,
        r.publishedAt ? `      <pubDate>${new Date(r.publishedAt).toUTCString()}</pubDate>` : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(SITE_NAME)}</title>
    <link>${xml(SITE_URL)}</link>
    <description>${xml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
${items}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
