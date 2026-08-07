// Read-only coverage report for deciding which enrichment lane should run next.
//
//   npm run db:audit-library
import "./env";
import { prisma } from "../src/index";

async function main() {
  const [movies, people] = await Promise.all([
    prisma.movie.count(),
    prisma.person.count(),
  ]);
  const movieMissing = {
    overview: await prisma.movie.count({ where: { overview: null } }),
    releaseDate: await prisma.movie.count({ where: { releaseDate: null } }),
    runtime: await prisma.movie.count({ where: { runtime: null } }),
    director: await prisma.movie.count({ where: { director: null } }),
    genres: await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM "Movie" WHERE cardinality(genres) = 0
    `,
    poster: await prisma.movie.count({ where: { posterPath: null, image: null } }),
    trailer: await prisma.movie.count({ where: { trailerKey: null, videos: { none: {} } } }),
    cast: await prisma.movie.count({
      where: { cast: { none: {} }, NOT: { genres: { has: "Animation" } } },
    }),
    crew: await prisma.movie.count({ where: { crew: { none: {} } } }),
    sourceIdentity: await prisma.movie.count({ where: { wikidataId: null, tmdbId: null } }),
  };
  const peopleMissing = {
    facts: await prisma.person.count({
      where: { birthDate: null, wikipediaUrl: null, occupations: { isEmpty: true } },
    }),
    portrait: await prisma.person.count({ where: { image: null } }),
  };
  const latest = await prisma.movie.findMany({
    orderBy: [{ releaseDate: "desc" }, { title: "asc" }],
    take: 12,
    select: { title: true, releaseDate: true, slug: true },
  });
  const coreIncomplete = await prisma.movie.findMany({
    where: {
      OR: [
        { overview: null }, { releaseDate: null }, { runtime: null }, { director: null },
        { genres: { isEmpty: true } },
        { cast: { none: {} }, NOT: { genres: { has: "Animation" } } },
        { crew: { none: {} } },
      ],
    },
    orderBy: { releaseDate: "desc" },
    select: { title: true, slug: true, genres: true, _count: { select: { cast: true, crew: true } } },
  });

  console.log(`Movies: ${movies}`);
  for (const [field, raw] of Object.entries(movieMissing)) {
    const count = Array.isArray(raw) ? Number(raw[0]?.count ?? 0) : raw;
    console.log(`  missing ${field.padEnd(14)} ${String(count).padStart(4)}`);
  }
  console.log(`People: ${people}`);
  for (const [field, count] of Object.entries(peopleMissing)) {
    console.log(`  missing ${field.padEnd(14)} ${String(count).padStart(4)}`);
  }
  if (coreIncomplete.length > 0) {
    console.log("Core-incomplete:");
    for (const movie of coreIncomplete) {
      console.log(`  ${movie.title}: ${movie.genres.length} genres, ${movie._count.cast} cast, ${movie._count.crew} crew`);
    }
  }
  console.log("Latest:");
  for (const movie of latest) {
    console.log(`  ${movie.releaseDate?.toISOString().slice(0, 10) ?? "unknown"}  ${movie.title}  /movies/${movie.slug}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
