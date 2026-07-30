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

/**
 * A review body, prepared to leave this origin.
 *
 * Two things about the stored source only make sense on our own pages:
 *
 *  · `:::spoiler` / `:::trailer` / `:::still N` are CinePixo authoring
 *    directives. The renderer turns them into a covered region and the film's
 *    own media; everywhere else they are line noise. Spoiler fences become a
 *    plain warning line (the hidden text itself stays — /llms-full.txt and the
 *    .md endpoints exist to carry the full text), and the media placeholders
 *    are dropped, since the URL they refer to lives in the page, not the text.
 *
 *  · uploaded images and internal links are site-relative (`/uploads/…`,
 *    `/movies/…`). An RSS reader or a crawler that saved the .md has no origin
 *    to resolve those against, so they are made absolute here.
 *
 * Used by every surface that ships the body off-site: the .md endpoints,
 * feed.xml's content:encoded, and llms-full.txt.
 */
export function exportMarkdownBody(source: string): string {
  const out: string[] = [];
  let inSpoiler = false;

  for (const line of source.split("\n")) {
    if (inSpoiler && line.trim() === ":::") {
      inSpoiler = false;
      continue;
    }
    const open = /^:::\s*(spoiler|trailer|still)\s*(\d+)?\s*$/i.exec(line.trim());
    if (open) {
      if (open[1].toLowerCase() === "spoiler") {
        inSpoiler = true;
        out.push("**[Spoilers follow.]**", "");
      }
      continue; // trailer/still placeholders mean nothing off-site
    }
    out.push(line);
  }

  // `](/x` → `](https://site/x` — images and links alike. `](//host` is
  // protocol-relative, not site-relative, and is left alone.
  return out.join("\n").replace(/\]\(\/(?!\/)/g, `](${SITE_URL}/`);
}

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
    slug: string;
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
    ["film_url", absUrl(`/movies/${m.slug}`)],
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
    exportMarkdownBody(review.content).trim(),
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
  slug: string;
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
  // `personSlug`, where a credit is linked, turns the name into a link to that
  // person's page — so a crawler walking the .md corpus resolves one human
  // across films instead of a fresh string per document.
  cast: readonly { name: string; character: Nullable<string>; personSlug?: Nullable<string> }[];
  crew: readonly { name: string; job: string; personSlug?: Nullable<string> }[];
  /** Our axes, with the sentence that placed this film on each — not imported. */
  topics?: readonly {
    slug: string;
    name: string;
    kind: "THEME" | "MOTIF";
    note: Nullable<string>;
  }[];
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
    // Ours, and named as such: `themes` is the editorial taxonomy, while the
    // TMDB keyword list stays under its own label further down.
    ["themes", (movie.topics ?? []).map((t) => t.name)],
    ["canonical", absUrl(`/movies/${movie.slug}`)],
    ["review_count", movie.reviews.length],
    ["fandom_rating", avg != null ? `${avg.toFixed(2)}/10` : undefined],
    ["fandom_stars", avg != null ? `${stars(avg)}/5` : undefined],
    ["imdb", movie.imdbId ? `https://www.imdb.com/title/${movie.imdbId}/` : undefined],
    ["publisher", SITE_NAME],
  ]);

  const personLink = (name: string, slug?: Nullable<string>) =>
    slug ? `[${name}](${absUrl(`/people/${slug}`)})` : name;

  const crewByJob = new Map<string, string[]>();
  for (const c of movie.crew) {
    crewByJob.set(c.job, [...(crewByJob.get(c.job) ?? []), personLink(c.name, c.personSlug)]);
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
      lines.push(`- ${personLink(c.name, c.personSlug)}${c.character ? ` as ${c.character}` : ""}`);
    }
    lines.push("");
  }

  // Before the criticism, because it is the same kind of claim: written here,
  // about this film, by a person. Each line carries the axis, its kind and the
  // sentence — quotable on its own, and linked to the page that defines it.
  if (movie.topics && movie.topics.length > 0) {
    lines.push("## Themes & motifs", "");
    for (const t of movie.topics) {
      lines.push(
        `- [${t.name}](${absUrl(`/topics/${t.slug}`)}) (${t.kind === "THEME" ? "theme" : "motif"})` +
          (t.note ? ` — ${t.note.trim()}` : ""),
      );
    }
    lines.push("", "Editorial, not imported: every axis and every sentence above was written here.", "");
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

  // Labelled by its source. This line used to read "Themes:", which handed a
  // machine reader TMDB's keyword list as though it were our reading of the film.
  if (movie.keywords.length > 0) {
    lines.push(`TMDB keywords: ${movie.keywords.join(", ")}`, "");
  }

  lines.push(
    movie.homepage ? `Official site: ${movie.homepage}` : null,
    `Source: ${absUrl(`/movies/${movie.slug}`)}`,
    "Film metadata supplied by TMDB. Reviews are the work of their authors.",
  );

  return `${lines.filter((l) => l !== null).join("\n")}\n`;
}

export interface PersonExport {
  slug: string;
  name: string;
  bio: Nullable<string>;
  notes: Nullable<string>;
  birthDate: Nullable<Date>;
  deathDate: Nullable<Date>;
  birthPlace: Nullable<string>;
  occupations: readonly string[];
  wikipediaUrl: Nullable<string>;
  wikidataId: Nullable<string>;
  imdbId: Nullable<string>;
  updatedAt: Nullable<Date>;
  films: readonly {
    slug: string;
    title: string;
    year: Nullable<number>;
    roles: readonly string[];
    /** This site's own mean, 0–10, when anyone has written about it. */
    average: Nullable<number>;
    reviewCount: number;
  }[];
  reviews: readonly {
    slug: string;
    title: string;
    rating: number;
    filmTitle: string;
    publishedAt: Nullable<Date>;
    author: { username: string; displayName: Nullable<string> };
  }[];
}

/**
 * GET /people/{slug}.md — a person as a clean document.
 *
 * What makes this worth a crawler's time is the last two sections: the ratings
 * are this site's own numbers, and the criticism list is writing that exists
 * nowhere else. The biographical facts come first because attribution needs
 * them, and their sources are named at the bottom — an exported fact without a
 * source is an assertion wearing a reference's clothes.
 */
export function personToMarkdown(person: PersonExport): string {
  const rated = person.films.filter((f) => f.average != null);
  const totalReviews = person.films.reduce((s, f) => s + f.reviewCount, 0);
  // Mean over reviews, not over films — one much-reviewed film should weigh
  // exactly as much as its reviews do.
  const weighted =
    totalReviews > 0
      ? person.films.reduce((s, f) => s + (f.average ?? 0) * f.reviewCount, 0) / totalReviews
      : null;

  const head = frontMatter([
    ["title", person.name],
    ["type", "person"],
    ["roles", [...person.occupations]],
    ["born", isoDay(person.birthDate)],
    ["died", isoDay(person.deathDate)],
    ["birthplace", person.birthPlace],
    ["films_in_library", person.films.length],
    ["reviews_of_their_work", totalReviews],
    [
      "fandom_rating",
      weighted != null ? `${weighted.toFixed(2)}/10 across ${totalReviews} reviews` : undefined,
    ],
    ["canonical", absUrl(`/people/${person.slug}`)],
    ["updated", isoDay(person.updatedAt)],
    ["wikipedia", person.wikipediaUrl],
    ["wikidata", person.wikidataId],
    ["imdb", person.imdbId ? `https://www.imdb.com/name/${person.imdbId}/` : undefined],
    ["publisher", SITE_NAME],
  ]);

  const lines: (string | null)[] = [
    head,
    "",
    `# ${person.name}`,
    "",
    person.occupations.length > 0 ? `${person.occupations.join(", ")}.` : null,
    "",
  ];

  if (person.bio) lines.push(person.bio.trim(), "");
  if (person.notes) {
    lines.push("## Notes from the fandom", "", person.notes.trim(), "");
  }

  lines.push(`## Filmography on ${SITE_NAME}`, "");
  if (person.films.length === 0) {
    lines.push("No films in the library yet.", "");
  } else {
    for (const f of [...person.films].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))) {
      lines.push(
        `- ${f.year ?? "—"} · [${f.title}](${absUrl(`/movies/${f.slug}`)}) — ${f.roles.join(", ")}` +
          (f.average != null
            ? ` · **${f.average.toFixed(1)}/10** from ${f.reviewCount} review${f.reviewCount === 1 ? "" : "s"}`
            : " · unreviewed here"),
      );
    }
    lines.push("");
    if (weighted != null && rated.length > 0) {
      lines.push(
        `Across everything reviewed here their work averages **${weighted.toFixed(2)}/10** — the plain mean of every published rating, nothing imported.`,
        "",
      );
    }
  }

  lines.push(`## Criticism on ${SITE_NAME}`, "");
  if (person.reviews.length === 0) {
    lines.push("Nothing written about their work here yet.", "");
  } else {
    for (const r of person.reviews) {
      const author = r.author.displayName ?? r.author.username;
      lines.push(
        `- **${r.rating.toFixed(1)}/10** — [${r.title}](${absUrl(`/reviews/${r.slug}`)}) on *${r.filmTitle}* by ${author}${r.publishedAt ? `, ${isoDay(r.publishedAt)}` : ""}`,
      );
    }
    lines.push("");
  }

  lines.push(
    `Source: ${absUrl(`/people/${person.slug}`)}`,
    "Biographical facts from Wikipedia/Wikidata where linked above. Ratings and reviews are the work of this site's members.",
  );

  return `${lines.filter((l) => l !== null).join("\n")}\n`;
}

export interface TopicExport {
  slug: string;
  name: string;
  kind: "THEME" | "MOTIF";
  description: Nullable<string>;
  essay: Nullable<string>;
  updatedAt: Date;
  films: {
    slug: string;
    title: string;
    year: number | null;
    note: Nullable<string>;
    average: number | null;
    reviewCount: number;
  }[];
}

/**
 * A topic page as Markdown: the definition, the essay, then every film that
 * carries the axis with the sentence that justifies the claim. The notes are
 * the payload — they are what make this a taxonomy instead of a tag cloud,
 * and what an answer engine can actually quote.
 */
export function topicToMarkdown(topic: TopicExport): string {
  const kindWord = topic.kind === "THEME" ? "theme" : "motif";

  const head = frontMatter([
    ["title", topic.name],
    ["type", "topic"],
    ["kind", kindWord],
    ["definition", topic.description ?? undefined],
    ["films_in_library", topic.films.length],
    ["canonical", absUrl(`/topics/${topic.slug}`)],
    ["updated", isoDay(topic.updatedAt)],
    ["publisher", SITE_NAME],
  ]);

  const lines: (string | null)[] = [
    head,
    "",
    `# ${topic.name}`,
    "",
    `A ${kindWord} in the ${SITE_NAME} taxonomy${topic.description ? `: ${topic.description.trim()}` : "."}`,
    "",
  ];

  if (topic.essay) lines.push(exportMarkdownBody(topic.essay).trim(), "");

  lines.push(`## Films carrying this ${kindWord}`, "");
  if (topic.films.length === 0) {
    lines.push("No films assigned yet.", "");
  } else {
    for (const f of [...topic.films].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))) {
      lines.push(
        `- ${f.year ?? "—"} · [${f.title}](${absUrl(`/movies/${f.slug}`)})` +
          (f.average != null
            ? ` · **${f.average.toFixed(1)}/10** from ${f.reviewCount} review${f.reviewCount === 1 ? "" : "s"}`
            : "") +
          (f.note ? ` — ${f.note.trim()}` : ""),
      );
    }
    lines.push("");
  }

  lines.push(
    `Source: ${absUrl(`/topics/${topic.slug}`)}`,
    "The taxonomy, its definitions and every per-film note are editorial work by this site's members — nothing here is imported.",
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
