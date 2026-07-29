// Clean-Markdown renditions of the site's content.
//
// This is the GEO half of the job. A crawler that wants to *quote* a review has
// to reconstruct it from HTML full of navigation, score bubbles and poster rails;
// what it actually wants is the piece, its rating, its author and its date, with
// nothing else in the way. So we publish exactly that, at a sibling URL, and
// advertise it from the HTML with `rel="alternate" type="text/markdown"`.
//
// YAML front matter is deliberate: it puts the facts an answer engine needs to
// attribute a quote (author, date, rating, canonical URL) above the prose, where
// they can be read without parsing the body at all.

import { absUrl, isoDay, plainText } from "./seo";
import { SITE_NAME, SITE_URL } from "./site";

type Nullable<T> = T | null | undefined;

/** Quote a YAML scalar. Single quotes with doubling is safe for any input. */
function yaml(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function frontMatter(fields: [string, Nullable<string | number | string[]>][]): string {
  const lines: string[] = ["---"];
  for (const [key, value] of fields) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${yaml(item)}`);
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${yaml(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

const stars = (rating: number) => (Math.round((rating / 2) * 100) / 100).toFixed(2);

const year = (d: Nullable<Date>) => (d ? new Date(d).getFullYear() : null);

export interface ReviewExport {
  slug: string;
  title: string;
  excerpt: Nullable<string>;
  verdict: Nullable<string>;
  content: string;
  rating: number;
  spoilers: Nullable<string>;
  publishedAt: Nullable<Date>;
  updatedAt: Nullable<Date>;
  author: { username: string; displayName: Nullable<string> };
  movie: {
    id: string;
    title: string;
    originalTitle: Nullable<string>;
    releaseDate: Nullable<Date>;
    director: Nullable<string>;
    runtime: Nullable<number>;
    certification: Nullable<string>;
    genres: readonly string[];
    countries: readonly string[];
    posterPath: Nullable<string>;
    imdbId: Nullable<string>;
  };
}

export function reviewToMarkdown(review: ReviewExport): string {
  const m = review.movie;
  const author = review.author.displayName ?? review.author.username;
  const releaseYear = year(m.releaseDate);

  const head = frontMatter([
    ["title", review.title],
    ["type", "film-review"],
    ["film", releaseYear ? `${m.title} (${releaseYear})` : m.title],
    ["director", m.director],
    ["author", author],
    ["rating", `${review.rating.toFixed(1)}/10`],
    ["stars", `${stars(review.rating)}/5`],
    ["published", isoDay(review.publishedAt)],
    ["updated", isoDay(review.updatedAt)],
    ["canonical", absUrl(`/reviews/${review.slug}`)],
    ["film_url", absUrl(`/movies/${m.id}`)],
    ["publisher", SITE_NAME],
    ["genres", [...m.genres]],
    [
      "spoilers",
      review.spoilers === "FULL" ? "full" : review.spoilers === "MILD" ? "mild" : "none",
    ],
  ]);

  const spec = [
    releaseYear ? `Released ${releaseYear}` : null,
    m.director ? `Directed by ${m.director}` : null,
    m.runtime ? `${m.runtime} min` : null,
    m.certification ? `Rated ${m.certification}` : null,
    m.genres.length > 0 ? m.genres.join(", ") : null,
    m.countries.length > 0 ? m.countries.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const spoilerNote =
    review.spoilers === "FULL"
      ? "**Spoiler warning:** this review discusses the ending in full."
      : review.spoilers === "MILD"
        ? "**Spoiler warning:** this review contains mild spoilers."
        : null;

  const body = [
    head,
    "",
    `# ${review.title}`,
    "",
    `**${author}** on *${m.title}*${releaseYear ? ` (${releaseYear})` : ""} — **${review.rating.toFixed(1)}/10** (${stars(review.rating)} of 5 stars)`,
    "",
    review.verdict ? `> ${review.verdict}` : null,
    review.verdict ? "" : null,
    review.excerpt && review.excerpt !== review.verdict ? `*${review.excerpt}*` : null,
    review.excerpt && review.excerpt !== review.verdict ? "" : null,
    spoilerNote,
    spoilerNote ? "" : null,
    "---",
    "",
    review.content.trim(),
    "",
    "---",
    "",
    "## The film",
    "",
    spec || m.title,
    m.originalTitle && m.originalTitle !== m.title ? `Original title: ${m.originalTitle}` : null,
    m.imdbId ? `IMDb: https://www.imdb.com/title/${m.imdbId}/` : null,
    "",
    `Published by ${SITE_NAME} — ${absUrl(`/reviews/${review.slug}`)}`,
    `Review © ${author}. Film metadata supplied by TMDB.`,
  ];

  return `${body.filter((line) => line !== null).join("\n")}\n`;
}

export interface MovieExport {
  id: string;
  title: string;
  originalTitle: Nullable<string>;
  tagline: Nullable<string>;
  overview: Nullable<string>;
  releaseDate: Nullable<Date>;
  runtime: Nullable<number>;
  certification: Nullable<string>;
  director: Nullable<string>;
  genres: readonly string[];
  keywords: readonly string[];
  countries: readonly string[];
  posterPath: Nullable<string>;
  imdbId: Nullable<string>;
  homepage: Nullable<string>;
  collectionName: Nullable<string>;
  updatedAt: Nullable<Date>;
  cast: readonly { name: string; character: Nullable<string> }[];
  crew: readonly { name: string; job: string }[];
  reviews: readonly {
    slug: string;
    title: string;
    rating: number;
    verdict?: Nullable<string>;
    publishedAt: Nullable<Date>;
    author: { username: string; displayName: Nullable<string> };
  }[];
}

export function movieToMarkdown(movie: MovieExport): string {
  const releaseYear = year(movie.releaseDate);
  const director = movie.crew.find((c) => c.job === "Director")?.name ?? movie.director;
  const ratings = movie.reviews.map((r) => r.rating);
  const avg = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;

  const head = frontMatter([
    ["title", releaseYear ? `${movie.title} (${releaseYear})` : movie.title],
    ["type", "film"],
    ["director", director],
    ["released", isoDay(movie.releaseDate)],
    ["runtime_minutes", movie.runtime ?? undefined],
    ["certification", movie.certification],
    ["genres", [...movie.genres]],
    ["countries", [...movie.countries]],
    ["canonical", absUrl(`/movies/${movie.id}`)],
    ["review_count", movie.reviews.length],
    ["fandom_rating", avg != null ? `${avg.toFixed(2)}/10` : undefined],
    ["fandom_stars", avg != null ? `${stars(avg)}/5` : undefined],
    ["imdb", movie.imdbId ? `https://www.imdb.com/title/${movie.imdbId}/` : undefined],
    ["publisher", SITE_NAME],
  ]);

  const crewByJob = new Map<string, string[]>();
  for (const c of movie.crew) {
    crewByJob.set(c.job, [...(crewByJob.get(c.job) ?? []), c.name]);
  }

  const lines: (string | null)[] = [
    head,
    "",
    `# ${movie.title}${releaseYear ? ` (${releaseYear})` : ""}`,
    "",
    movie.tagline ? `> ${movie.tagline}` : null,
    movie.tagline ? "" : null,
    [
      releaseYear,
      movie.certification,
      movie.runtime ? `${movie.runtime} min` : null,
      movie.genres.join(", ") || null,
      movie.countries.join(", ") || null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
    "",
    movie.originalTitle && movie.originalTitle !== movie.title
      ? `Original title: ${movie.originalTitle}`
      : null,
    movie.collectionName ? `Part of: ${movie.collectionName}` : null,
    "",
  ];

  if (movie.overview) {
    lines.push("## Synopsis", "", movie.overview.trim(), "");
  }

  if (crewByJob.size > 0) {
    lines.push("## Credits", "");
    for (const [job, names] of crewByJob) {
      lines.push(`- **${job}:** ${names.join(", ")}`);
    }
    lines.push("");
  } else if (director) {
    lines.push("## Credits", "", `- **Director:** ${director}`, "");
  }

  if (movie.cast.length > 0) {
    lines.push("## Cast", "");
    for (const c of movie.cast.slice(0, 15)) {
      lines.push(`- ${c.name}${c.character ? ` as ${c.character}` : ""}`);
    }
    lines.push("");
  }

  lines.push(`## Criticism on ${SITE_NAME}`, "");
  if (movie.reviews.length === 0) {
    lines.push("No reviews published yet.", "");
  } else {
    if (avg != null) {
      lines.push(
        `Fandom rating: **${avg.toFixed(2)}/10** (${stars(avg)} of 5) from ${movie.reviews.length} review${movie.reviews.length === 1 ? "" : "s"} — the plain average of every published rating.`,
        "",
      );
    }
    for (const r of movie.reviews) {
      const author = r.author.displayName ?? r.author.username;
      lines.push(
        `- **${r.rating.toFixed(1)}/10** — [${r.title}](${absUrl(`/reviews/${r.slug}`)}) by ${author}${r.publishedAt ? `, ${isoDay(r.publishedAt)}` : ""}`,
      );
      if (r.verdict) lines.push(`  > ${plainText(r.verdict)}`);
    }
    lines.push("");
  }

  if (movie.keywords.length > 0) {
    lines.push(`Themes: ${movie.keywords.join(", ")}`, "");
  }

  lines.push(
    movie.homepage ? `Official site: ${movie.homepage}` : null,
    `Source: ${absUrl(`/movies/${movie.id}`)}`,
    "Film metadata supplied by TMDB. Reviews are the work of their authors.",
  );

  return `${lines.filter((l) => l !== null).join("\n")}\n`;
}

/** Response shape shared by every Markdown endpoint. */
export function markdownResponse(body: string, maxAge = 600): Response {
  return new Response(body, {
    headers: {
      // Not text/html, so nothing in a review body can execute on our origin.
      // `nosniff` is already set globally in next.config.ts.
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=86400`,
      "X-Robots-Tag": "index, follow",
    },
  });
}

export const notFoundMarkdown = () =>
  new Response(`# Not found\n\nNo such page on ${SITE_URL}.\n`, {
    status: 404,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
