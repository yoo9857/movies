import "./env";
import { movieSlug } from "../../shared/src/index";
import { prisma } from "../src/index";

const WIKI_LICENSE = "CC BY-SA 4.0";

const movies = [
  {
    wikidataId: "Q125971387", imdbId: "tt12300742", title: "Bugonia",
    releaseDate: "2025-08-28", runtime: 118, director: "Yorgos Lanthimos",
    genres: ["Comedy", "Science Fiction", "Thriller"],
    countries: ["United Kingdom", "Ireland", "South Korea", "United States of America"],
    overview: "Two conspiracy-obsessed young men kidnap a powerful CEO because they believe she is an alien intent on destroying Earth.",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Bugonia_(film)",
    cast: ["Emma Stone", "Jesse Plemons", "Aidan Delbis", "Stavros Halkias", "Alicia Silverstone"],
    crew: [["Yorgos Lanthimos", "Director"], ["Will Tracy", "Screenplay"], ["Robbie Ryan", "Director of Photography"], ["Yorgos Mavropsaridis", "Editor"], ["Jerskin Fendrix", "Original Music Composer"]],
  },
  {
    wikidataId: "Q114246242", title: "F1",
    releaseDate: "2025-06-16", runtime: 155, director: "Joseph Kosinski",
    genres: ["Drama", "Action"], countries: ["United States of America"],
    overview: "A former Formula One driver returns after thirty years to help save an underdog team and race alongside its gifted rookie.",
    wikipediaUrl: "https://en.wikipedia.org/wiki/F1_(film)",
    cast: ["Brad Pitt", "Damson Idris", "Kerry Condon", "Tobias Menzies", "Javier Bardem"],
    crew: [["Joseph Kosinski", "Director"], ["Ehren Kruger", "Screenplay"], ["Claudio Miranda", "Director of Photography"], ["Stephen Mirrione", "Editor"], ["Hans Zimmer", "Original Music Composer"]],
  },
  {
    wikidataId: "Q124393045", title: "Frankenstein",
    releaseDate: "2025-08-30", runtime: 150, director: "Guillermo del Toro",
    genres: ["Drama", "Science Fiction", "Horror"], countries: ["United States of America"],
    overview: "Victor Frankenstein, a brilliant but arrogant scientist, creates life through a dangerous experiment and unleashes consequences for creator and creature alike.",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Frankenstein_(2025_film)",
    cast: ["Oscar Isaac", "Jacob Elordi", "Mia Goth", "Christoph Waltz"],
    crew: [["Guillermo del Toro", "Director"], ["Guillermo del Toro", "Screenplay"], ["Dan Laustsen", "Director of Photography"], ["Evan Schiff", "Editor"], ["Alexandre Desplat", "Original Music Composer"]],
  },
  {
    wikidataId: "Q122741016", imdbId: "tt14905854", title: "Hamnet",
    releaseDate: "2025-08-29", runtime: 126, director: "Chloé Zhao",
    genres: ["Drama", "History"], countries: ["United Kingdom", "United States of America"],
    overview: "William Shakespeare and Agnes Hathaway endure the death of their eleven-year-old son Hamnet, a loss that reshapes their family and art.",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Hamnet_(film)",
    cast: ["Jessie Buckley", "Paul Mescal", "Jacobi Jupe", "Emily Watson", "Joe Alwyn", "Noah Jupe"],
    crew: [["Chloé Zhao", "Director"], ["Chloé Zhao", "Screenplay"], ["Maggie O'Farrell", "Screenplay"], ["Łukasz Żal", "Director of Photography"], ["Affonso Gonçalves", "Editor"], ["Max Richter", "Original Music Composer"]],
  },
  {
    wikidataId: "Q130268157", imdbId: "tt14205554", title: "KPop Demon Hunters",
    releaseDate: "2025-06-20", runtime: 95, director: "Maggie Kang, Chris Appelhans",
    genres: ["Animation", "Music", "Fantasy", "Action", "Family"], countries: ["United States of America"],
    overview: "K-pop trio Huntrix secretly protect humanity from demons, but a rival boy band threatens both their fans and the magical barrier they defend.",
    wikipediaUrl: "https://en.wikipedia.org/wiki/KPop_Demon_Hunters",
    cast: ["Arden Cho", "Ahn Hyo-seop", "May Hong", "Ji-young Yoo", "Yunjin Kim", "Daniel Dae Kim", "Ken Jeong", "Lee Byung-hun"],
    crew: [["Maggie Kang", "Director"], ["Chris Appelhans", "Director"], ["Maggie Kang", "Screenplay"], ["Chris Appelhans", "Screenplay"], ["Gary H. Lee", "Director of Photography"], ["Nathan Schauf", "Editor"], ["Marcelo Zarvos", "Original Music Composer"]],
  },
  {
    wikidataId: "Q125473145", imdbId: "tt31193180", title: "Sinners",
    releaseDate: "2025-04-03", runtime: 138, director: "Ryan Coogler",
    genres: ["Horror", "Drama", "Music"], countries: ["United States of America"],
    overview: "Twin brothers return to 1932 Mississippi to open a juke joint, only to confront a supernatural evil waiting in their hometown.",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Sinners_(2025_film)",
    cast: ["Michael B. Jordan", "Hailee Steinfeld", "Miles Caton", "Jack O'Connell", "Wunmi Mosaku", "Jayme Lawson", "Omar Benson Miller", "Delroy Lindo"],
    crew: [["Ryan Coogler", "Director"], ["Ryan Coogler", "Writer"], ["Autumn Durald Arkapaw", "Director of Photography"], ["Michael P. Shawver", "Editor"], ["Ludwig Göransson", "Original Music Composer"]],
  },
] as const;

async function main() {
  let inserted = 0;
  for (const entry of movies) {
    const existing = await prisma.movie.findUnique({ where: { wikidataId: entry.wikidataId } });
    if (existing) {
      console.log(`= ${entry.title} already exists`);
      continue;
    }

    const date = new Date(`${entry.releaseDate}T00:00:00.000Z`);
    const base = movieSlug(entry.title, date);
    let slug = base;
    for (let suffix = 2; await prisma.movie.findUnique({ where: { slug } }); suffix += 1) {
      slug = `${base}-${suffix}`;
    }

    await prisma.movie.create({
      data: {
        wikidataId: entry.wikidataId,
        imdbId: "imdbId" in entry ? entry.imdbId : null,
        slug,
        title: entry.title,
        overview: entry.overview,
        overviewSourceUrl: entry.wikipediaUrl,
        overviewLicense: WIKI_LICENSE,
        wikipediaUrl: entry.wikipediaUrl,
        originalLanguage: "English",
        releaseDate: date,
        runtime: entry.runtime,
        director: entry.director,
        genres: [...entry.genres],
        keywords: [],
        countries: [...entry.countries],
        cast: {
          create: entry.cast.map((name, order) => ({ name, order })),
        },
        crew: {
          create: entry.crew.map(([name, job]) => ({ name, job })),
        },
      },
    });
    inserted += 1;
    console.log(`+ ${entry.title} -> /movies/${slug}`);
  }
  console.log(`Inserted ${inserted}; library now has ${await prisma.movie.count()} films.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
