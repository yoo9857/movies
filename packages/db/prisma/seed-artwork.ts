// Cast photos and the artwork gallery. Every image path below was checked
// against image.tmdb.org (HTTP 200) before being committed — nothing is
// guessed, so no broken frames ship. Actors without a verified path keep the
// initial-letter fallback until a TMDB refresh fills them in.
import "./env";
import { prisma } from "../src/index";

// actor name → verified TMDB profile path
const PROFILES: Record<string, string> = {
  "Christian Bale": "/kU3B75TyRiCgE270EyZnHjfivoq.jpg",
  "Heath Ledger": "/5Y9HnYYa9jF4NunY9lSgJGjSe8E.jpg",
  "Michael Caine": "/bVUsM4aYiHbeSYE1xAw2H5Z1ANU.jpg",
  "Gary Oldman": "/2v9FVVBUrrkW2m3QOcYkuhq9A6o.jpg",
  "Morgan Freeman": "/jPsLqiYGSofU4s6BjrxnefMfabb.jpg",
  "Song Kang-ho": "/5XBzD5WuTyVQZeS4VI25z2moMeY.jpg",
  "Samuel L. Jackson": "/nCJJ3NVksYNxIzEHcyC1XziwPVj.jpg",
  "Ryan Gosling": "/lyUyVARQKhGxaxy0FbPJCQRpiaW.jpg",
  "Anne Hathaway": "/tLelKoPNiyJCSEtQTz1FGv4TLGc.jpg",
  "Jessica Chastain": "/lodMzLKSdrPcBry6TdoDsMN3Vge.jpg",
};

// Extra videos, so films with more than one give the picker something to pick.
// Each key was resolved through YouTube's oEmbed endpoint before inclusion.
const EXTRA_VIDEOS: { tmdbId: number; key: string; name: string; type: string }[] = [
  { tmdbId: 157336, key: "2LqzF5WauAw", name: "Original Theatrical Trailer 1", type: "Trailer" },
  { tmdbId: 157336, key: "0vxOhd4qlnA", name: "Original Theatrical Trailer 3", type: "Trailer" },
  { tmdbId: 62, key: "Z2UWOeBcsJI", name: "1968 Theatrical Trailer", type: "Trailer" },
  { tmdbId: 680, key: "tGpTpVyI_OQ", name: "Official Trailer (HD)", type: "Trailer" },
];

async function main() {
  // ── Extra videos ──
  let vids = 0;
  for (const v of EXTRA_VIDEOS) {
    const movie = await prisma.movie.findUnique({ where: { tmdbId: v.tmdbId } });
    if (!movie) continue;
    const existing = await prisma.movieVideo.count({ where: { movieId: movie.id } });
    await prisma.movieVideo.upsert({
      where: { movieId_youtubeKey: { movieId: movie.id, youtubeKey: v.key } },
      update: { name: v.name, type: v.type },
      create: {
        movieId: movie.id,
        youtubeKey: v.key,
        name: v.name,
        type: v.type,
        official: true,
        sort: existing,
      },
    });
    vids += 1;
  }

  // ── Cast photos ──
  let photos = 0;
  for (const [name, profilePath] of Object.entries(PROFILES)) {
    const res = await prisma.movieCast.updateMany({
      where: { name, profilePath: null },
      data: { profilePath },
    });
    photos += res.count;
  }

  // ── Artwork gallery ──
  // Seed from the poster and backdrop each film already carries, so the
  // gallery is populated before any TMDB refresh adds alternates.
  const movies = await prisma.movie.findMany({
    select: { id: true, posterPath: true, backdropPath: true },
  });
  let art = 0;
  for (const m of movies) {
    // kind is an enum column now; keep the literal types so createMany accepts it
    const rows = [
      m.posterPath && { kind: "poster" as const, path: m.posterPath, sort: 0 },
      m.backdropPath && { kind: "backdrop" as const, path: m.backdropPath, sort: 0 },
    ].filter(
      (r): r is { kind: "poster" | "backdrop"; path: string; sort: number } => Boolean(r),
    );

    for (const r of rows) {
      await prisma.movieImage.upsert({
        where: { movieId_path: { movieId: m.id, path: r.path } },
        update: {},
        create: { movieId: m.id, ...r },
      });
      art += 1;
    }
  }

  console.log(
    `Artwork seeded: ${photos} cast photos · ${art} gallery images · ${vids} extra videos`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
