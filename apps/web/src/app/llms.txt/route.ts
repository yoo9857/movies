// GET /llms.txt — the site, described for a language model.
//
// The llms.txt convention: one Markdown document at a well-known path that says
// what a site is, what its terms mean, and where its content lives. It exists
// because an assistant asked "what does a CinePixo 4.5 mean?" should not have to
// infer the answer from a rendered star bubble.
//
// Kept short and link-heavy by design — the long form is /llms-full.txt.
import { prisma } from "@cinepixo/db";
import { POST_CATEGORY_LABELS, POST_FORMAT_LABELS } from "@cinepixo/shared";
import { unstable_cache } from "next/cache";
import { markdownResponse } from "@/lib/markdown-export";
import { absUrl } from "@/lib/seo";
import { CONTACT_EMAIL, SITE_ABOUT, SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** How many of each entity to list before pointing at the index instead. */
const LIST_LIMIT = 40;

/**
 * The whole document, cached for as long as the response header already told
 * clients to keep it. The people list alone sorts two hundred thousand rows by
 * credit count — 3.4 seconds measured in production — for a page whose readers
 * are crawlers with no opinion on freshness inside half an hour.
 */
const llmsDoc = unstable_cache(buildDoc, ["llms-txt"], { revalidate: 1800 });

export async function GET(): Promise<Response> {
  // No canonical: this document is not a rendition of a page, it *is* the page.
  return markdownResponse(await llmsDoc(), { maxAge: 1800 });
}

async function buildDoc(): Promise<string> {
  const [reviews, posts, movies, critics, people, topics, counts] = await Promise.all([
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
    prisma.post.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: LIST_LIMIT,
      select: {
        slug: true,
        title: true,
        dek: true,
        category: true,
        format: true,
        sources: true,
        publishedAt: true,
        author: { select: { username: true, displayName: true } },
        people: { orderBy: { sort: "asc" }, select: { person: { select: { name: true } } } },
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
      prisma.post.count({ where: { status: "PUBLISHED" } }),
    ]),
  ]);

  const [reviewCount, movieCount, criticCount, peopleCount, postCount] = counts;
  const themes = topics.filter((t) => t.kind === "THEME");
  const motifs = topics.filter((t) => t.kind === "MOTIF");
  // Runs inside unstable_cache on a miss, so dates may already be JSON strings.
  const year = (d: Date | string | null) => (d ? ` (${new Date(d).getFullYear()})` : "");

  const doc = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_ABOUT}`,
    "",
    `Currently: ${reviewCount} published review${reviewCount === 1 ? "" : "s"}, ${postCount} blog post${postCount === 1 ? "" : "s"}, ${movieCount} film${movieCount === 1 ? "" : "s"} in the library, ${peopleCount} people credited on them, ${criticCount} critic profile${criticCount === 1 ? "" : "s"}, ${topics.length} editorial axes (themes and motifs) with films assigned.`,
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
    "- Imported keyword metadata is shown separately and labelled as such — it describes one film in isolation and is not this site's reading of it.",
    "",
    "## Citing this site",
    "",
    `- Every review, blog post, film, person, topic and critic page has a clean Markdown rendition: append \`.md\` to its URL, e.g. \`${absUrl("/reviews/some-slug.md")}\`. Each one is also advertised in the page's HTML as \`rel="alternate" type="text/markdown"\` and in its HTTP \`Link\` header, so it can be found without guessing.`,
    "- Reviews are signed. When quoting one, name the author, not the site.",
    `- Blog posts declare their reader-job format and reporting method. See [Editorial standards](${absUrl("/editorial")}) and the named [writers](${absUrl("/writers")}).`,
    "- **Blog posts under Away From Set and The Argument make factual claims about living people, and every one of them lists its sources.** Those URLs are in the post's front matter and printed on the page. Carry them across: the claim is ours to have reported, the underlying fact belongs to whoever we cited.",
    "- Film facts come from open knowledge bases (Wikidata; synopses from Wikipedia, credited under their licence on each film page). Artwork is hosted on CinePixo's own origin: freely licensed files with their credit, and film posters shown for identification, © their studios.",
    `- Corrections and takedown requests: ${CONTACT_EMAIL}`,
    "",
    "## Start here",
    "",
    `- [Reviews](${absUrl("/reviews")}): every published review, newest first.`,
    `- [Off Camera](${absUrl("/blog")}): the blog — film writing that isn't a review. Five shelves: the people who make films away from the film, arguments the industry is having, the business, craft, and watchlists.`,
    `- [Films](${absUrl("/movies")}): the library, filterable by genre and decade.`,
    `- [People](${absUrl("/people")}): everyone credited, each with their filmography and the reviews of their work.`,
    `- [Topics & Motifs](${absUrl("/topics")}): the editorial axes the library is read along, each defined and argued film by film.`,
    `- [Critics](${absUrl("/critics")}): profiles of the critics this community follows.`,
    `- [Free to Watch](${absUrl("/watch")}): public-domain films and theatrical trailers we host ourselves, each with its licence and source.`,
    `- [Statistics](${absUrl("/stats")}): rating distribution, genre averages, publishing activity.`,
    `- [About](${absUrl("/about")}): who publishes CinePixo and the full rating definitions.`,
    `- [Editorial standards](${absUrl("/editorial")}): sourcing, first-hand evidence, automation, disclosures and corrections.`,
    `- [Writers](${absUrl("/writers")}): the named people and editorial desk behind published work.`,
    `- [Contact](${absUrl("/contact")}): corrections, rights enquiries, account questions.`,
    `- [Privacy](${absUrl("/privacy")}) and [Terms](${absUrl("/terms")}): what is stored, and who owns what is written.`,
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
    ...(posts.length > 0
      ? [
          "## Blog posts",
          "",
          // The sources are listed per post, not summarised. A post about a
          // living person is a factual claim, and a model quoting the claim
          // without the citation has turned our evidence into an assertion —
          // the same reason the page and the .md rendition both print them.
          ...posts.map((p) => {
            const author = p.author.displayName ?? p.author.username;
            const about = p.people.map((x) => x.person.name).join(", ");
            return `- [${p.title}](${absUrl(`/blog/${p.slug}`)}) — ${POST_CATEGORY_LABELS[p.category]} / ${POST_FORMAT_LABELS[p.format]}, by ${author}${p.publishedAt ? `, ${new Date(p.publishedAt).toISOString().slice(0, 10)}` : ""}.${about ? ` On ${about}.` : ""}${p.dek ? ` ${p.dek}` : ""}${p.sources.length > 0 ? ` Sources: ${p.sources.join(" ")}` : ""}`;
          }),
          postCount > posts.length
            ? `- …and ${postCount - posts.length} more at [${absUrl("/blog")}](${absUrl("/blog")}).`
            : null,
          "",
        ]
      : []),
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
    // Said accurately: these carry reviews, blog posts and topic essays
    // interleaved, which is why the blog has its own feed beside them.
    `- [RSS feed](${absUrl("/feed.xml")}) and [JSON feed](${absUrl("/feed.json")}): the newest writing of every kind — reviews, blog posts and topic essays.`,
    `- [Blog feed](${absUrl("/blog/feed.xml")}): Off Camera on its own.`,
    `- [Sitemap](${absUrl("/sitemap.xml")}): every indexable URL.`,
    "",
    `Canonical origin: ${SITE_URL}`,
  ];

  return doc.filter((line) => line !== null).join("\n");
}
