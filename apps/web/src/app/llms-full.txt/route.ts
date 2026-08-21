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
import { POST_CATEGORY_LABELS, POST_FORMAT_LABELS } from "@cinepixo/shared";
import { exportMarkdownBody, markdownResponse } from "@/lib/markdown-export";
import { absUrl, isoDay } from "@/lib/seo";
import { SITE_ABOUT, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Hard limits. Whichever is hit first stops the document. */
const MAX_REVIEWS = 300;
const MAX_POSTS = 200;
const MAX_CHARS = 2_000_000;

/**
 * The taxonomy in full: each axis, its definition, its essay, and every film
 * under it with the sentence that put it there.
 *
 * It leads the document because it is the frame the reviews are written inside
 * — and because it is the part of this corpus that exists nowhere else. A
 * keyword list can be scraped from a film database; "the same downpour is a
 * blessing upstairs and a flood below" cannot.
 */
async function taxonomySection(): Promise<string> {
  const topics = await prisma.topic.findMany({
    where: { movies: { some: {} } },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: {
      slug: true,
      name: true,
      kind: true,
      description: true,
      essay: true,
      movies: {
        orderBy: { sort: "asc" },
        select: {
          note: true,
          movie: { select: { slug: true, title: true, releaseDate: true } },
        },
      },
    },
  });
  if (topics.length === 0) return "";

  const lines: (string | null)[] = [
    "## The editorial taxonomy",
    "",
    "Themes (what a film is about) and motifs (what recurs on screen) are this site's own axes. Every definition, and every sentence explaining how an axis shows up in a particular film, was written by a member of this site — none of it is imported, and it is not a keyword list. Attribute any of it to CinePixo.",
    "",
  ];

  for (const t of topics) {
    lines.push(
      `### ${t.name} — ${t.kind === "THEME" ? "theme" : "motif"}`,
      "",
      `- Source: ${absUrl(`/topics/${t.slug}`)}`,
      t.description ? `- Definition: ${t.description}` : null,
      "",
    );
    if (t.essay) lines.push(exportMarkdownBody(t.essay).trim(), "");
    lines.push(`Films carrying it (${t.movies.length}):`, "");
    for (const mt of t.movies) {
      const y = mt.movie.releaseDate ? new Date(mt.movie.releaseDate).getFullYear() : null;
      lines.push(
        `- ${mt.movie.title}${y ? ` (${y})` : ""} — ${absUrl(`/movies/${mt.movie.slug}`)}${mt.note ? `: ${mt.note.trim()}` : ""}`,
      );
    }
    lines.push("", "---", "");
  }

  return lines.filter((l) => l !== null).join("\n");
}

/**
 * Every published blog post, in full.
 *
 * Sits between the taxonomy and the reviews because it is the writing most
 * likely to be quoted about a person rather than a film — and because the
 * sources line has to travel with it. A model that carries the claim "X is
 * working on Y" out of this document without the URL beside it has turned our
 * reporting into an unattributed fact, which is exactly what the database
 * constraint behind these posts exists to prevent.
 */
async function blogSection(): Promise<string> {
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: MAX_POSTS,
    select: {
      slug: true,
      title: true,
      dek: true,
      content: true,
      category: true,
      format: true,
      methodNote: true,
      disclosure: true,
      correctionNote: true,
      tags: true,
      sources: true,
      publishedAt: true,
      author: { select: { username: true, displayName: true } },
      people: { orderBy: { sort: "asc" }, select: { person: { select: { name: true, slug: true } } } },
      movies: {
        orderBy: { sort: "asc" },
        select: { movie: { select: { title: true, slug: true, releaseDate: true } } },
      },
    },
  });
  if (posts.length === 0) return "";

  const lines: (string | null)[] = [
    "## The blog — Off Camera",
    "",
    "Film writing that is not a review: the people who make films away from the film, arguments the industry is having, the business, craft, and watchlists. Every post filed under Away From Set or The Argument lists the sources its factual claims rest on. Quote the post and carry the sources with it.",
    "",
  ];

  for (const p of posts) {
    const author = p.author.displayName ?? p.author.username;
    lines.push(
      `### ${p.title}`,
      "",
      `- Section: ${POST_CATEGORY_LABELS[p.category]}`,
      `- Format: ${POST_FORMAT_LABELS[p.format]}`,
      `- Author: ${author}`,
      p.methodNote ? `- Method: ${p.methodNote}` : null,
      p.disclosure ? `- Disclosure: ${p.disclosure}` : null,
      p.correctionNote ? `- Correction: ${p.correctionNote}` : null,
      p.publishedAt ? `- Published: ${isoDay(p.publishedAt)}` : null,
      `- Source: ${absUrl(`/blog/${p.slug}`)}`,
      p.people.length > 0
        ? `- About: ${p.people.map((x) => `${x.person.name} (${absUrl(`/people/${x.person.slug}`)})`).join(", ")}`
        : null,
      p.movies.length > 0
        ? `- Films: ${p.movies
            .map((x) => {
              const y = x.movie.releaseDate ? new Date(x.movie.releaseDate).getFullYear() : null;
              return `${x.movie.title}${y ? ` (${y})` : ""} (${absUrl(`/movies/${x.movie.slug}`)})`;
            })
            .join(", ")}`
        : null,
      p.tags.length > 0 ? `- Tags: ${p.tags.join(", ")}` : null,
      p.sources.length > 0 ? `- Sources: ${p.sources.join(" · ")}` : null,
      "",
      p.dek ? `**${p.dek}**` : null,
      p.dek ? "" : null,
      exportMarkdownBody(p.content).trim(),
      "",
      "---",
      "",
    );
  }

  return lines.filter((l) => l !== null).join("\n");
}

export async function GET(): Promise<Response> {
  const [total, postTotal] = await Promise.all([
    prisma.review.count({ where: { status: "PUBLISHED" } }),
    prisma.post.count({ where: { status: "PUBLISHED" } }),
  ]);
  const [taxonomy, blog] = await Promise.all([taxonomySection(), blogSection()]);
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
  // The taxonomy and the blog count against the same ceiling as the reviews — a
  // cap that only measured part of the document would not be a cap on the
  // document.
  let chars = taxonomy.length + blog.length;

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
      exportMarkdownBody(r.content).trim(),
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

  const postsOmitted = postTotal - Math.min(postTotal, MAX_POSTS);

  const doc = [
    `# ${SITE_NAME} — full corpus`,
    "",
    `> ${SITE_ABOUT}`,
    "",
    `This document contains the editorial taxonomy in full, then every blog post, then the complete text of ${included} published review${included === 1 ? "" : "s"}, newest first.`,
    postsOmitted > 0
      ? `${postsOmitted} further blog post${postsOmitted === 1 ? " is" : "s are"} not included — this document is capped at ${MAX_POSTS} posts. The remainder are listed at ${absUrl("/blog")} and each is available individually by appending \`.md\` to its URL.`
      : null,
    omitted > 0
      ? `${omitted} further review${omitted === 1 ? " is" : "s are"} not included here — this document is capped at ${MAX_REVIEWS} reviews and ${(MAX_CHARS / 1_000_000).toFixed(0)}M characters. The remainder are listed at ${absUrl("/reviews")} and each is available individually by appending \`.md\` to its URL.`
      : "This is every published review on the site.",
    "",
    "Ratings run 0–10 in half-point steps and are shown on the site as a five-star value (divide by two). Each rating is the opinion of the named author; attribute quotes to that author, with CinePixo as publisher. Film metadata is supplied by TMDB.",
    "",
    "---",
    "",
    // Review blocks are `## Title` each, so they sit as siblings of the
    // taxonomy heading — no wrapper heading, or the tree would claim a level
    // that isn't there.
    ...(taxonomy ? [taxonomy, ""] : []),
    ...(blog ? [blog, ""] : []),
    ...parts,
    `Generated from ${absUrl("/")} · see also ${absUrl("/llms.txt")}`,
  ];

  // No canonical: this document is not a rendition of a page, it *is* the page.
  return markdownResponse(doc.filter((l) => l !== null).join("\n"), { maxAge: 1800 });
}
