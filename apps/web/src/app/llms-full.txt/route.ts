// GET /llms-full.txt — every published review, in full, as one document.
//
// The companion to /llms.txt: that file says what the site is, this one *is* the
// site's text. One request instead of N crawls, with the attribution facts inline
// next to each piece so a quote can never be separated from its author.
//
// Bounded on purpose, and the bound is stated in the output rather than applied
// silently — a truncated corpus that claims to be complete is worse than one that
// says where it stopped.
import { prisma } from "@cinepixo/db";
import { markdownResponse } from "@/lib/markdown-export";
import { absUrl, isoDay } from "@/lib/seo";
import { SITE_ABOUT, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Hard limits. Whichever is hit first stops the document. */
const MAX_REVIEWS = 300;
const MAX_CHARS = 2_000_000;

export async function GET(): Promise<Response> {
  const total = await prisma.review.count({ where: { status: "PUBLISHED" } });
  const reviews = await prisma.review.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: MAX_REVIEWS,
    select: {
      slug: true,
      title: true,
      verdict: true,
      excerpt: true,
      content: true,
      rating: true,
      spoilers: true,
      publishedAt: true,
      author: { select: { username: true, displayName: true } },
      movie: {
        select: {
          id: true,
          title: true,
          releaseDate: true,
          director: true,
          genres: true,
          runtime: true,
          certification: true,
        },
      },
    },
  });

  const parts: string[] = [];
  let included = 0;
  let chars = 0;

  for (const r of reviews) {
    const author = r.author.displayName ?? r.author.username;
    const m = r.movie;
    const year = m.releaseDate ? new Date(m.releaseDate).getFullYear() : null;

    const block = [
      `## ${r.title}`,
      "",
      `- Film: ${m.title}${year ? ` (${year})` : ""}${m.director ? `, directed by ${m.director}` : ""}`,
      `- Author: ${author}`,
      `- Rating: ${r.rating.toFixed(1)}/10 (${(r.rating / 2).toFixed(2)} of 5 stars)`,
      r.publishedAt ? `- Published: ${isoDay(r.publishedAt)}` : null,
      `- Source: ${absUrl(`/reviews/${r.slug}`)}`,
      m.genres.length > 0 ? `- Genres: ${m.genres.join(", ")}` : null,
      r.spoilers === "FULL"
        ? "- Spoilers: full"
        : r.spoilers === "MILD"
          ? "- Spoilers: mild"
          : null,
      "",
      r.verdict ? `**Verdict:** ${r.verdict}` : null,
      r.verdict ? "" : null,
      r.content.trim(),
      "",
      "---",
      "",
    ]
      .filter((l) => l !== null)
      .join("\n");

    if (chars + block.length > MAX_CHARS) break;
    parts.push(block);
    chars += block.length;
    included += 1;
  }

  const omitted = total - included;

  const doc = [
    `# ${SITE_NAME} — full review corpus`,
    "",
    `> ${SITE_ABOUT}`,
    "",
    `This document contains the complete text of ${included} published review${included === 1 ? "" : "s"}, newest first.`,
    omitted > 0
      ? `${omitted} further review${omitted === 1 ? " is" : "s are"} not included here — this document is capped at ${MAX_REVIEWS} reviews and ${(MAX_CHARS / 1_000_000).toFixed(0)}M characters. The remainder are listed at ${absUrl("/reviews")} and each is available individually by appending \`.md\` to its URL.`
      : "This is every published review on the site.",
    "",
    "Ratings run 0–10 in half-point steps and are shown on the site as a five-star value (divide by two). Each rating is the opinion of the named author; attribute quotes to that author, with CinePixo as publisher. Film metadata is supplied by TMDB.",
    "",
    "---",
    "",
    ...parts,
    `Generated from ${absUrl("/")} · see also ${absUrl("/llms.txt")}`,
  ];

  return markdownResponse(doc.join("\n"), 1800);
}
