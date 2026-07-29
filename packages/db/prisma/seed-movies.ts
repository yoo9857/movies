// Extra library seed — real films with image paths verified against
// image.tmdb.org (HTTP 200) before inclusion. Idempotent (upsert by tmdbId).
import { prisma } from "../src/index";

const j = JSON.stringify;

const MOVIES = [
  {
    tmdbId: 496243,
    title: "Parasite",
    originalTitle: "기생충",
    tagline: "Act like you own the place.",
    overview:
      "All unemployed, Ki-taek's family takes peculiar interest in the wealthy and glamorous Parks for their livelihood until they get entangled in an unexpected incident.",
    posterPath: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    backdropPath: "/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg",
    releaseDate: new Date("2019-05-30"),
    runtime: 133,
    director: "Bong Joon-ho",
    genres: j(["Comedy", "Thriller", "Drama"]),
    keywords: j(["class", "black comedy", "con artist", "basement", "family"]),
    countries: j(["South Korea"]),
    certification: "R",
    budget: 11_400_000,
    revenue: 262_100_000,
    voteAverage: 8.5,
    voteCount: 19542,
    trailerKey: "5xH0HfJHsaY",
  },
  {
    tmdbId: 155,
    title: "The Dark Knight",
    originalTitle: "The Dark Knight",
    tagline: "Welcome to a world without rules.",
    overview:
      "Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets. The partnership proves to be effective, but they soon find themselves prey to a reign of chaos unleashed by a rising criminal mastermind known to the terrified citizens of Gotham as the Joker.",
    posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    backdropPath: "/hkBaDkMWbLaf8B1lsWsKX7Ew3Xq.jpg",
    releaseDate: new Date("2008-07-16"),
    runtime: 152,
    director: "Christopher Nolan",
    genres: j(["Drama", "Action", "Crime", "Thriller"]),
    keywords: j(["dc comics", "crime fighter", "chaos", "vigilante", "joker"]),
    countries: j(["United Kingdom", "United States of America"]),
    certification: "PG-13",
    budget: 185_000_000,
    revenue: 1_004_558_444,
    voteAverage: 8.5,
    voteCount: 33000,
    trailerKey: "EXeTwQWrcwY",
  },
  {
    tmdbId: 680,
    title: "Pulp Fiction",
    originalTitle: "Pulp Fiction",
    tagline: "Just because you are a character doesn't mean you have character.",
    overview:
      "A burger-loving hit man, his philosophical partner, a drug-addled gangster's moll and a washed-up boxer converge in this sprawling, comedic crime caper. Their adventures unfurl in three stories that ingeniously trip back and forth in time.",
    posterPath: "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
    backdropPath: "/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg",
    releaseDate: new Date("1994-09-10"),
    runtime: 154,
    director: "Quentin Tarantino",
    genres: j(["Thriller", "Crime"]),
    keywords: j(["nonlinear timeline", "hitman", "diner", "boxer", "dark comedy"]),
    countries: j(["United States of America"]),
    certification: "R",
    budget: 8_000_000,
    revenue: 213_928_762,
    voteAverage: 8.5,
    voteCount: 28000,
    trailerKey: "s7EdQ4FqbhY",
  },
  {
    tmdbId: 313369,
    title: "La La Land",
    originalTitle: "La La Land",
    tagline: "Here's to the fools who dream.",
    overview:
      "Mia, an aspiring actress, serves lattes to movie stars in between auditions and Sebastian, a jazz musician, scrapes by playing cocktail party gigs in dingy bars, but as success mounts they are faced with decisions that begin to fray the fragile fabric of their love affair.",
    posterPath: "/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg",
    backdropPath: "/fNTtVbqI92abEKAgz2ynurCUne.jpg",
    releaseDate: new Date("2016-11-29"),
    runtime: 128,
    director: "Damien Chazelle",
    genres: j(["Comedy", "Drama", "Romance", "Music"]),
    keywords: j(["jazz", "los angeles", "musical", "dream", "audition"]),
    countries: j(["United States of America"]),
    certification: "PG-13",
    budget: 30_000_000,
    revenue: 447_407_695,
    voteAverage: 7.9,
    voteCount: 17000,
  },
  {
    tmdbId: 244786,
    title: "Whiplash",
    originalTitle: "Whiplash",
    tagline: "The road to greatness can take you to the edge.",
    overview:
      "Under the direction of a ruthless instructor, a talented young drummer begins to pursue perfection at any cost, even his humanity.",
    posterPath: "/7fn624j5lj3xTme2SgiLCeuedmO.jpg",
    backdropPath: "/6d5XOczc226jECq0LIX0siKtgHR.jpg",
    releaseDate: new Date("2014-10-10"),
    runtime: 107,
    director: "Damien Chazelle",
    genres: j(["Drama", "Music"]),
    keywords: j(["jazz", "drummer", "obsession", "teacher", "ambition"]),
    countries: j(["United States of America"]),
    certification: "R",
    budget: 3_300_000,
    revenue: 49_000_000,
    voteAverage: 8.4,
    voteCount: 15000,
    trailerKey: "7d_jQycdQGo",
  },
  {
    tmdbId: 62,
    title: "2001: A Space Odyssey",
    originalTitle: "2001: A Space Odyssey",
    tagline: "An epic drama of adventure and exploration.",
    overview:
      "Humanity finds a mysterious object buried beneath the lunar surface and sets off to find its origins with the help of HAL 9000, the world's most advanced super computer.",
    posterPath: "/ve72VxNqjGM69Uky4WTo2bK6rfq.jpg",
    backdropPath: null,
    releaseDate: new Date("1968-04-02"),
    runtime: 149,
    director: "Stanley Kubrick",
    genres: j(["Science Fiction", "Mystery", "Adventure"]),
    keywords: j(["artificial intelligence", "monolith", "space", "evolution", "hal 9000"]),
    countries: j(["United Kingdom", "United States of America"]),
    certification: "G",
    budget: 10_500_000,
    revenue: 71_927_560,
    voteAverage: 8.1,
    voteCount: 11000,
    trailerKey: "oR_e9y-bka0",
  },
  {
    tmdbId: 545611,
    title: "Everything Everywhere All at Once",
    originalTitle: "Everything Everywhere All at Once",
    tagline: "The universe is so much bigger than you realize.",
    overview:
      "An aging Chinese immigrant is swept up in an insane adventure, where she alone can save what's important to her by connecting with the lives she could have led in other universes.",
    posterPath: "/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg",
    backdropPath: null,
    releaseDate: new Date("2022-03-24"),
    runtime: 139,
    director: "Daniel Kwan, Daniel Scheinert",
    genres: j(["Action", "Adventure", "Science Fiction"]),
    keywords: j(["multiverse", "family", "laundromat", "absurdist", "mother daughter"]),
    countries: j(["United States of America"]),
    certification: "R",
    budget: 14_300_000,
    revenue: 141_200_000,
    voteAverage: 7.8,
    voteCount: 12000,
    trailerKey: "wxN1T1uxQ2g",
  },
  {
    tmdbId: 157336,
    title: "Interstellar",
    originalTitle: "Interstellar",
    tagline: "Mankind was born on Earth. It was never meant to die here.",
    overview:
      "The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.",
    posterPath: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    backdropPath: "/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
    releaseDate: new Date("2014-11-05"),
    runtime: 169,
    director: "Christopher Nolan",
    genres: j(["Adventure", "Drama", "Science Fiction"]),
    keywords: j(["wormhole", "space", "time dilation", "father daughter", "black hole"]),
    countries: j(["United Kingdom", "United States of America"]),
    certification: "PG-13",
    budget: 165_000_000,
    revenue: 701_729_206,
    voteAverage: 8.4,
    voteCount: 36000,
    trailerKey: "zSWdZVtXT7E",
  },
  {
    tmdbId: 129,
    title: "Spirited Away",
    originalTitle: "千と千尋の神隠し",
    tagline: "The tunnel led Chihiro to a mysterious town.",
    overview:
      "A young girl, Chihiro, becomes trapped in a strange new world of spirits. When her parents undergo a mysterious transformation, she must call upon the courage she never knew she had to free her family.",
    posterPath: "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
    backdropPath: "/Ab8mkHmkYADjU7wQiOkia9BzGvS.jpg",
    releaseDate: new Date("2001-07-20"),
    runtime: 125,
    director: "Hayao Miyazaki",
    genres: j(["Animation", "Family", "Fantasy"]),
    keywords: j(["spirit world", "bathhouse", "witch", "coming of age", "dragon"]),
    countries: j(["Japan"]),
    certification: "PG",
    budget: 19_000_000,
    revenue: 274_925_095,
    voteAverage: 8.5,
    voteCount: 16000,
    trailerKey: "ByXuk9QqQkk",
  },
];

const REVIEWS: {
  tmdbId: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  rating: number;
  publishedAt: Date;
}[] = [
  {
    tmdbId: 244786,
    slug: "whiplash-not-my-tempo",
    title: "Not Quite My Tempo — Whiplash and the Cost of Great",
    excerpt:
      "Chazelle shoots jazz drumming like a war film. The question the movie refuses to answer is whether Fletcher was right.",
    content:
      "## A war film with cymbals\n\n*Whiplash* is edited like combat: sweat, blood on the snare, cuts timed to rim-shots. By the final Caravan, you're not watching a concert — you're watching a duel.\n\nThe genius of the ending is that it gives Fletcher exactly what he wanted while letting Andrew lose everything a person should keep. Ebert would have called it what it is: a horror film about excellence.",
    rating: 9.0,
    publishedAt: new Date("2026-05-14"),
  },
  {
    tmdbId: 62,
    slug: "2001-the-monolith-still-wins",
    title: "The Monolith Still Wins",
    excerpt:
      "Fifty-eight years on, no film has matched its nerve: a blockbuster that trusts silence more than dialogue.",
    content:
      "## Silence as spectacle\n\nKubrick cut the explanatory narration two weeks before release, and that decision is the whole movie. *2001* trusts images — a bone, a waltz, an eye — to do what exposition never could.\n\nHAL remains cinema's best villain because he is polite. The horror is procedural.\n\n## Why this rating\n\nA perfect score is a claim that a film changed the medium. This one did, twice: once in 1968, and once every time someone watches it for the first time.",
    rating: 10,
    publishedAt: new Date("2026-06-20"),
  },
  {
    tmdbId: 545611,
    slug: "eeaao-maximalism-with-a-heart",
    title: "Maximalism With a Heart of Bagel",
    excerpt:
      "The Daniels hide a quiet immigrant-family drama inside the loudest movie of the decade — and both halves work.",
    content:
      "## Everything, everywhere, deliberately\n\nThe multiverse here isn't lore, it's a metaphor with a costume budget. Every absurd universe — hot-dog fingers, raccoon chefs, rocks with googly eyes — exists to ask one plain question: what if I had been kinder?\n\nMichelle Yeoh grounds it. Ke Huy Quan breaks your heart in three timelines at once.",
    rating: 8.5,
    publishedAt: new Date("2026-07-10"),
  },
];

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("Run the base seed first (no admin user found)");

  for (const m of MOVIES) {
    const { tmdbId, ...data } = m;
    await prisma.movie.upsert({ where: { tmdbId }, update: data, create: { tmdbId, ...data } });
  }
  console.log(`Movies upserted: ${MOVIES.length}`);

  for (const r of REVIEWS) {
    const movie = await prisma.movie.findUnique({ where: { tmdbId: r.tmdbId } });
    if (!movie) continue;
    await prisma.review.upsert({
      where: { slug: r.slug },
      update: {},
      create: {
        slug: r.slug,
        title: r.title,
        excerpt: r.excerpt,
        content: r.content,
        rating: r.rating,
        status: "PUBLISHED",
        publishedAt: r.publishedAt,
        authorId: admin.id,
        movieId: movie.id,
      },
    });
  }
  console.log(`Reviews upserted: ${REVIEWS.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
