// GET /people/{slug}.md — the person, their record here, and the criticism.
//
// Same contract as the review and movie endpoints: a clean document rather than
// a page, outside /api/ so robots.txt does not disallow it.
import { prisma } from "@cinepixo/db";
import { markdownResponse, notFoundMarkdown, personToMarkdown } from "@/lib/markdown-export";

export const dynamic = "force-dynamic";

const movieSelect = {
  slug: true,
  title: true,
  releaseDate: true,
  reviews: { where: { status: "PUBLISHED" as const }, select: { rating: true } },
};

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,130}$/.test(slug)) return notFoundMarkdown();

  const person = await prisma.person.findUnique({
    where: { slug },
    include: {
      castRoles: { include: { movie: { select: movieSelect } } },
      crewRoles: { include: { movie: { select: movieSelect } } },
    },
  });
  if (!person) return notFoundMarkdown();

  // One film entry however many hats they wore on it.
  const byFilm = new Map<
    string,
    { movie: (typeof person.castRoles)[number]["movie"]; roles: string[] }
  >();
  for (const c of person.castRoles) {
    const e = byFilm.get(c.movie.slug) ?? { movie: c.movie, roles: [] };
    const role = c.character ? `as ${c.character}` : "actor";
    if (!e.roles.includes(role)) e.roles.push(role);
    byFilm.set(c.movie.slug, e);
  }
  for (const c of person.crewRoles) {
    const e = byFilm.get(c.movie.slug) ?? { movie: c.movie, roles: [] };
    if (!e.roles.includes(c.job)) e.roles.push(c.job);
    byFilm.set(c.movie.slug, e);
  }

  const films = [...byFilm.values()].map(({ movie, roles }) => {
    const ratings = movie.reviews.map((r) => r.rating);
    return {
      slug: movie.slug,
      title: movie.title,
      year: movie.releaseDate ? new Date(movie.releaseDate).getUTCFullYear() : null,
      roles,
      average: ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null,
      reviewCount: ratings.length,
    };
  });

  const reviews = await prisma.review.findMany({
    where: {
      status: "PUBLISHED",
      movie: { slug: { in: films.map((f) => f.slug) } },
    },
    orderBy: { publishedAt: "desc" },
    take: 40,
    select: {
      slug: true,
      title: true,
      rating: true,
      publishedAt: true,
      author: { select: { username: true, displayName: true } },
      movie: { select: { title: true } },
    },
  });

  return markdownResponse(
    personToMarkdown({
      slug: person.slug,
      name: person.name,
      bio: person.bio,
      notes: person.notes,
      birthDate: person.birthDate,
      deathDate: person.deathDate,
      birthPlace: person.birthPlace,
      occupations: person.occupations,
      wikipediaUrl: person.wikipediaUrl,
      wikidataId: person.wikidataId,
      imdbId: person.imdbId,
      updatedAt: person.updatedAt,
      films,
      reviews: reviews.map((r) => ({
        slug: r.slug,
        title: r.title,
        rating: r.rating,
        filmTitle: r.movie.title,
        publishedAt: r.publishedAt,
        author: r.author,
      })),
    }),
    { canonicalPath: `/people/${person.slug}` },
  );
}
