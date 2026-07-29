// Principal cast, studios and franchise data for the seeded library, so the
// movie pages are complete even before a TMDB API key is configured.
// Text only — no image paths are invented here; the cast rail falls back to
// initials, and a later TMDB "Refresh" fills in photos, artwork and videos.
import { prisma } from "../src/index";

interface Detail {
  tmdbId: number;
  companies: string[];
  collection?: { id: number; name: string };
  instagram?: string;
  facebook?: string;
  homepage?: string;
  cast: [string, string][]; // [actor, character]
  crew?: [string, string][]; // [name, job]
}

const DETAILS: Detail[] = [
  {
    tmdbId: 496243, // Parasite
    companies: ["Barunson E&A", "CJ Entertainment"],
    instagram: "parasitemovie",
    facebook: "ParasiteMovie",
    cast: [
      ["Song Kang-ho", "Kim Ki-taek"],
      ["Lee Sun-kyun", "Park Dong-ik"],
      ["Cho Yeo-jeong", "Yeon-kyo"],
      ["Choi Woo-shik", "Kim Ki-woo"],
      ["Park So-dam", "Kim Ki-jung"],
      ["Jang Hye-jin", "Kim Chung-sook"],
      ["Lee Jung-eun", "Gook Moon-gwang"],
    ],
    crew: [
      ["Bong Joon-ho", "Director"],
      ["Han Jin-won", "Screenplay"],
      ["Hong Kyung-pyo", "Director of Photography"],
      ["Jung Jae-il", "Original Music Composer"],
      ["Yang Jin-mo", "Editor"],
    ],
  },
  {
    tmdbId: 155, // The Dark Knight
    companies: ["Warner Bros. Pictures", "Legendary Pictures", "Syncopy"],
    collection: { id: 263, name: "The Dark Knight Collection" },
    cast: [
      ["Christian Bale", "Bruce Wayne / Batman"],
      ["Heath Ledger", "Joker"],
      ["Aaron Eckhart", "Harvey Dent / Two-Face"],
      ["Michael Caine", "Alfred Pennyworth"],
      ["Maggie Gyllenhaal", "Rachel Dawes"],
      ["Gary Oldman", "James Gordon"],
      ["Morgan Freeman", "Lucius Fox"],
    ],
    crew: [
      ["Christopher Nolan", "Director"],
      ["Jonathan Nolan", "Screenplay"],
      ["Wally Pfister", "Director of Photography"],
      ["Hans Zimmer", "Original Music Composer"],
      ["Lee Smith", "Editor"],
    ],
  },
  {
    tmdbId: 680, // Pulp Fiction
    companies: ["Miramax", "A Band Apart", "Jersey Films"],
    cast: [
      ["John Travolta", "Vincent Vega"],
      ["Samuel L. Jackson", "Jules Winnfield"],
      ["Uma Thurman", "Mia Wallace"],
      ["Bruce Willis", "Butch Coolidge"],
      ["Ving Rhames", "Marsellus Wallace"],
      ["Harvey Keitel", "Winston Wolfe"],
      ["Tim Roth", "Pumpkin"],
    ],
    crew: [
      ["Quentin Tarantino", "Director"],
      ["Roger Avary", "Screenplay"],
      ["Andrzej Sekula", "Director of Photography"],
      ["Sally Menke", "Editor"],
    ],
  },
  {
    tmdbId: 313369, // La La Land
    companies: ["Summit Entertainment", "Black Label Media", "Marc Platt Productions"],
    cast: [
      ["Ryan Gosling", "Sebastian Wilder"],
      ["Emma Stone", "Mia Dolan"],
      ["John Legend", "Keith"],
      ["Rosemarie DeWitt", "Laura Wilder"],
      ["J.K. Simmons", "Bill"],
      ["Finn Wittrock", "Greg"],
    ],
    crew: [
      ["Damien Chazelle", "Director"],
      ["Linus Sandgren", "Director of Photography"],
      ["Justin Hurwitz", "Original Music Composer"],
      ["Tom Cross", "Editor"],
    ],
  },
  {
    tmdbId: 244786, // Whiplash
    companies: ["Bold Films", "Blumhouse Productions", "Right of Way Films"],
    cast: [
      ["Miles Teller", "Andrew Neiman"],
      ["J.K. Simmons", "Terence Fletcher"],
      ["Paul Reiser", "Jim Neiman"],
      ["Melissa Benoist", "Nicole"],
      ["Austin Stowell", "Ryan Connolly"],
      ["Nate Lang", "Carl Tanner"],
    ],
    crew: [
      ["Damien Chazelle", "Director"],
      ["Sharone Meir", "Director of Photography"],
      ["Justin Hurwitz", "Original Music Composer"],
      ["Tom Cross", "Editor"],
    ],
  },
  {
    tmdbId: 62, // 2001
    companies: ["Metro-Goldwyn-Mayer", "Stanley Kubrick Productions"],
    cast: [
      ["Keir Dullea", "Dr. David Bowman"],
      ["Gary Lockwood", "Dr. Frank Poole"],
      ["William Sylvester", "Dr. Heywood Floyd"],
      ["Douglas Rain", "HAL 9000 (voice)"],
      ["Daniel Richter", "Moon-Watcher"],
      ["Leonard Rossiter", "Dr. Andrei Smyslov"],
    ],
    crew: [
      ["Stanley Kubrick", "Director"],
      ["Arthur C. Clarke", "Screenplay"],
      ["Geoffrey Unsworth", "Director of Photography"],
      ["Ray Lovejoy", "Editor"],
    ],
  },
  {
    tmdbId: 545611, // Everything Everywhere All at Once
    companies: ["A24", "AGBO", "Ley Line Entertainment"],
    instagram: "everythingeverywheremovie",
    cast: [
      ["Michelle Yeoh", "Evelyn Wang"],
      ["Ke Huy Quan", "Waymond Wang"],
      ["Stephanie Hsu", "Joy Wang / Jobu Tupaki"],
      ["Jamie Lee Curtis", "Deirdre Beaubeirdre"],
      ["James Hong", "Gong Gong"],
      ["Tallie Medel", "Becky Sregor"],
    ],
    crew: [
      ["Daniel Kwan", "Director"],
      ["Daniel Scheinert", "Director"],
      ["Larkin Seiple", "Director of Photography"],
      ["Paul Rogers", "Editor"],
    ],
  },
  {
    tmdbId: 157336, // Interstellar
    companies: ["Legendary Pictures", "Syncopy", "Lynda Obst Productions"],
    cast: [
      ["Matthew McConaughey", "Joseph Cooper"],
      ["Anne Hathaway", "Amelia Brand"],
      ["Jessica Chastain", "Murph"],
      ["Michael Caine", "Professor Brand"],
      ["Matt Damon", "Dr. Mann"],
      ["Casey Affleck", "Tom Cooper"],
      ["Mackenzie Foy", "Young Murph"],
    ],
    crew: [
      ["Christopher Nolan", "Director"],
      ["Jonathan Nolan", "Screenplay"],
      ["Hoyte van Hoytema", "Director of Photography"],
      ["Hans Zimmer", "Original Music Composer"],
      ["Lee Smith", "Editor"],
    ],
  },
  {
    tmdbId: 129, // Spirited Away
    companies: ["Studio Ghibli", "Tokuma Shoten"],
    cast: [
      ["Rumi Hiiragi", "Chihiro Ogino (voice)"],
      ["Miyu Irino", "Haku (voice)"],
      ["Mari Natsuki", "Yubaba / Zeniba (voice)"],
      ["Takashi Naito", "Akio Ogino (voice)"],
      ["Yasuko Sawaguchi", "Yuko Ogino (voice)"],
      ["Bunta Sugawara", "Kamaji (voice)"],
    ],
    crew: [
      ["Hayao Miyazaki", "Director"],
      ["Atsushi Okui", "Director of Photography"],
      ["Joe Hisaishi", "Original Music Composer"],
      ["Takeshi Seyama", "Editor"],
    ],
  },
];

async function main() {
  let castRows = 0;
  let crewRows = 0;

  for (const d of DETAILS) {
    const movie = await prisma.movie.findUnique({ where: { tmdbId: d.tmdbId } });
    if (!movie) continue;

    await prisma.movie.update({
      where: { id: movie.id },
      data: {
        companies: JSON.stringify(d.companies.map((name) => ({ name, logoPath: null }))),
        collectionId: d.collection?.id ?? null,
        collectionName: d.collection?.name ?? null,
        instagram: d.instagram ?? null,
        facebook: d.facebook ?? null,
        homepage: d.homepage ?? null,
      },
    });

    // Replace rather than append, so re-running stays idempotent.
    await prisma.movieCast.deleteMany({ where: { movieId: movie.id } });
    await prisma.movieCast.createMany({
      data: d.cast.map(([name, character], i) => ({
        movieId: movie.id,
        tmdbPersonId: 0,
        name,
        character,
        profilePath: null,
        order: i,
      })),
    });
    castRows += d.cast.length;

    if (d.crew) {
      await prisma.movieCrew.deleteMany({ where: { movieId: movie.id } });
      await prisma.movieCrew.createMany({
        data: d.crew.map(([name, job]) => ({
          movieId: movie.id,
          tmdbPersonId: 0,
          name,
          job,
          department: null,
          profilePath: null,
        })),
      });
      crewRows += d.crew.length;
    }

    // Promote the already-verified trailer into the video list so the picker
    // has something to show before a TMDB refresh.
    if (movie.trailerKey) {
      await prisma.movieVideo.upsert({
        where: { movieId_youtubeKey: { movieId: movie.id, youtubeKey: movie.trailerKey } },
        update: {},
        create: {
          movieId: movie.id,
          youtubeKey: movie.trailerKey,
          name: `${movie.title} — Official Trailer`,
          type: "Trailer",
          official: true,
          sort: 0,
        },
      });
    }
  }

  console.log(`Details seeded: ${DETAILS.length} movies · ${castRows} cast · ${crewRows} crew`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
