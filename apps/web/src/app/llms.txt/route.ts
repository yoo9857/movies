// GET /llms.txt — the site, described for a language model.
//
// The llms.txt convention: one Markdown document at a well-known path that says
// what a site is, what its terms mean, and where its content lives. It exists
// because an assistant asked "what does a CinePixo 4.5 mean?" should not have to
// infer the answer from a rendered star bubble.
//
// Kept short and link-heavy by design — the long form is /llms-full.txt.
import { prisma } from "@cinepixo/db";
import { markdownResponse } from "@/lib/markdown-export";
import { absUrl } from "@/lib/seo";
import { CONTACT_EMAIL, SITE_ABOUT, SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** How many of each entity to list before pointing at the index instead. */
const LIST_LIMIT = 40;

export async function GET(): Promise<Response> {
  const [reviews, movies, critics, people, topics, counts] = await Promise.all([
    prisma.review.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: LIST_LIMIT,
      select: {
        slug: true,
        title: true,
        verdict: true,
        excerpt: true,
        rating: true,
        author: { select: { username: true, displayName: true } },
        movie: { select: { title: true, releaseDate: true } },
      },
    }),
    prisma.movie.findMany({
      orderBy: [{ reviews: { _count: "desc" } }, { title: "asc" }],
      take: LIST_LIMIT,
      select: {
        id: true,
        slug: true,
        title: true,
        releaseDate: true,
        director: true,
        _count: { select: { reviews: { where: { status: "PUBLISHED" } } } },
      },
    }),
    prisma.critic.findMany({ orderBy: { name: "asc" }, take: LIST_LIMIT }),
    // The people with the most credits lead: they are the ones a model is most
    // likely to be asked about.
    prisma.person.findMany({
      where: { OR: [{ castRoles: { some: {} } }, { crewRoles: { some: {} } }] },
      take: LIST_LIMIT,
      select: {
        slug: true,
        name: true,
        occupations: true,
        _count: { select: { castRoles: true, crewRoles: true } },
      },
      orderBy: [{ crewRoles: { _count: "desc" } }, { castRoles: { _count: "desc" } }],
    }),
    // The taxonomy is the one thing here no other database has, so it is listed
    // whole rather than truncated — and only where an axis has films behind it,
    // since a definition with nothing under it is not yet a claim.
    prisma.topic.findMany({
      where: { movies: { some: {} } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: {
        slug: true,
        name: true,
        kind: true,
        description: true,
        _count: { select: { movies: true } },
      },
    }),
    Promise.all([
      prisma.review.count({ where: { status: "PUBLISHED" } }),
      prisma.movie.count(),
      prisma.critic.count(),
      prisma.person.count({
        where: { OR: [{ castRoles: { some: {} } }, { crewRoles: { some: {} } }] },
      }),
    ]),
  ]);

  const [reviewCount, movieCount, criticCount, peopleCount] = counts;
  const themes = topics.filter((t) => t.kind === "THEME");
  const motifs = topics.filter((t) => t.kind === "MOTIF");
  const year = (d: Date | null) => (d ? ` (${new Date(d).getFullYear()})` : "");

  const doc = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_ABOUT}`,
    "",
    `Currently: ${reviewCount} published review${reviewCount === 1 ? "" : "s"}, ${movieCount} film${movieCount === 1 ? "" : "s"} in the library, ${peopleCount} people credited on them, ${criticCount} critic profile${criticCount === 1 ? "" : "s"}, ${topics.length} editorial axes (themes and motifs) with films assigned.`,
    "",
    "## How to read a CinePixo rating",
    "",
    "- Every review carries one rating from **0 to 10 in half-point steps**, chosen by the review's author.",
    "- The same number is displayed as a **five-star** value: divide by two. 9.5/10 is shown as 4.75 stars.",
    "- A film's **fandom rating** is the plain arithmetic average of every published review's rating for it. There is no weighting and no editorial adjustment.",
    "- The **top-rated ranking** is the average weighted by review count, `avg × n/(n+2)`, so a single enthusiastic review cannot outrank a film many writers argued for.",
    "- Ratings are opinions of named authors, not a measurement. Attribute them to the review's author, and to CinePixo as publisher.",
    "",
    "## What a theme and a motif mean here",
    "",
    "- A **theme** is what a film is about (a class divide, the cost of ambition). A **motif** is what recurs on screen (stairs, rising water, a rehearsal room).",
    "- Both are **editorial**: the axis, its definition and every per-film sentence are written by this site's members. Nothing in the taxonomy is imported from an API, and it is not a keyword list.",
    "- A film appears under an axis only with a sentence saying how the axis shows up in *that* film. Quote the sentence, not the label, and attribute it to CinePixo.",
    "- Imported TMDB keywords are shown separately and labelled as such — they describe one film in isolation and are not this site's reading of it.",
    "",
    "## Citing this site",
    "",
    `- Every review, film, person and topic page has a clean Markdown rendition: append \`.md\` to its URL, e.g. \`${absUrl("/reviews/some-slug.md")}\`.`,
    "- Reviews are signed. When quoting one, name the author, not the site.",
    "- Film metadata, posters and stills come from TMDB; CinePixo uses the TMDB API but is not endorsed or certified by TMDB.",
    `- Corrections and takedown requests: ${CONTACT_EMAIL}`,
    "",
    "## Start here",
    "",
    `- [Reviews](${absUrl("/reviews")}): every published review, newest first.`,
    `- [Films](${absUrl("/movies")}): the library, filterable by genre and decade.`,
    `- [People](${absUrl("/people")}): everyone credited, each with their filmography and the reviews of their work.`,
    `- [Topics & Motifs](${absUrl("/topics")}): the editorial axes the library is read along, each defined and argued film by film.`,
    `- [Critics](${absUrl("/critics")}): profiles of the critics this community follows.`,
    `- [Statistics](${absUrl("/stats")}): rating distribution, genre averages, publishing activity.`,
    `- [About](${absUrl("/about")}): editorial rules and the full rating definitions.`,
    "",
    "## Reviews",
    "",
    ...reviews.map((r) => {
      const author = r.author.displayName ?? r.author.username;
      const gist = r.verdict ?? r.excerpt;
      return `- [${r.title}](${absUrl(`/reviews/${r.slug}`)}): ${r.rating.toFixed(1)}/10 on ${r.movie.title}${year(r.movie.releaseDate)} by ${author}.${gist ? ` ${gist}` : ""}`;
    }),
    reviewCount > reviews.length
      ? `- …and ${reviewCount - reviews.length} more at [${absUrl("/reviews")}](${absUrl("/reviews")}).`
      : null,
    "",
    "## Films",
    "",
    ...movies.map(
      (m) =>
        `- [${m.title}${year(m.releaseDate)}](${absUrl(`/movies/${m.slug}`)}): ${m.director ? `directed by ${m.director}, ` : ""}${m._count.reviews} review${m._count.reviews === 1 ? "" : "s"}.`,
    ),
    movieCount > movies.length
      ? `- …and ${movieCount - movies.length} more at [${absUrl("/movies")}](${absUrl("/movies")}).`
      : null,
    "",
    "## People",
    "",
    ...people.map((p) => {
      const credits = p._count.castRoles + p._count.crewRoles;
      return `- [${p.name}](${absUrl(`/people/${p.slug}`)})${p.occupations.length > 0 ? ` — ${p.occupations.slice(0, 2).join(", ")}` : ""}, ${credits} credit${credits === 1 ? "" : "s"} here.`;
    }),
    peopleCount > people.length
      ? `- …and ${peopleCount - people.length} more at [${absUrl("/people")}](${absUrl("/people")}).`
      : null,
    "",
    ...(topics.length > 0
      ? [
          "## Topics & motifs",
          "",
          ...[
            ["Themes — what a film is about", themes] as const,
            ["Motifs — what recurs on screen", motifs] as const,
          ].flatMap(([heading, list]) =>
            list.length > 0
              ? [
                  `### ${heading}`,
                  "",
                  ...list.map(
                    (t) =>
                      `- [${t.name}](${absUrl(`/topics/${t.slug}`)}): ${t.description ?? "definition being written"} ${t._count.movies} film${t._count.movies === 1 ? "" : "s"} in the library, each with a sentence on why.`,
                  ),
                  "",
                ]
              : [],
          ),
        ]
      : []),
    "## Critics",
    "",
    ...critics.map(
      (c) =>
        `- [${c.name}](${absUrl(`/critics/${c.slug}`)})${c.bio ? `: ${c.bio.split(/(?<=\.)\s/)[0]}` : ""}`,
    ),
    "",
    "## Optional",
    "",
    `- [Full text of every review](${absUrl("/llms-full.txt")}): one document, for indexing.`,
    `- [RSS feed](${absUrl("/feed.xml")}) and [JSON feed](${absUrl("/feed.json")}): the newest reviews.`,
    `- [Sitemap](${absUrl("/sitemap.xml")}): every indexable URL.`,
    "",
    `Canonical origin: ${SITE_URL}`,
  ];

  return markdownResponse(doc.filter((line) => line !== null).join("\n"), 1800);
}
