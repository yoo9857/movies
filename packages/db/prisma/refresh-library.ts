// Refresh cast/crew photos (and missing artwork) for every movie with a tmdbId.
//
//   npm run db:refresh-library
//
// Exists because the seeds ship only hand-verified image paths — most actors
// fall back to initials until TMDB fills them in, and the admin UI's per-movie
// Refresh button needs a signed-in admin clicking nine times. This is the same
// fill, done once, from the server, using the same field limits as the import
// route (20 cast, 12 key crew, 8 videos, 10+8 artwork).
//
// Deliberately conservative where the route is not: cast and crew are replaced
// (photos are the point), but movie fields, artwork and videos are only filled
// where they are currently empty — curation survives a refresh.
import "./env";
import { prisma } from "../src/index";

const KEY = process.env.TMDB_API_KEY;
if (!KEY) {
  console.error(
    "TMDB_API_KEY is not set (apps/web/.env.local). Get a free v3 key at " +
      "https://www.themoviedb.org/settings/api and set it, then rerun.",
  );
  process.exit(1);
}

interface Detail {
  poster_path: string | null;
  backdrop_path: string | null;
  tagline: string | null;
  credits?: {
    cast: { id: number; name: string; character: string | null; profile_path: string | null; order: number }[];
    crew: { id: number; name: string; job: string; department: string | null; profile_path: string | null }[];
  };
  videos?: { results: { key: string; name: string; site: string; type: string; official: boolean; published_at: string }[] };
  images?: {
    posters: { file_path: string; iso_639_1: string | null; vote_average: number }[];
    backdrops: { file_path: string; iso_639_1: string | null; vote_average: number }[];
  };
}

const KEY_CREW_JOBS = new Set([
  "Director", "Screenplay", "Writer", "Director of Photography",
  "Original Music Composer", "Editor", "Production Design",
]);
const VIDEO_TYPES = new Set(["Trailer", "Teaser", "Clip", "Featurette"]);

async function detail(tmdbId: number): Promise<Detail> {
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  url.searchParams.set("api_key", KEY!);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("append_to_response", "credits,videos,images");
  url.searchParams.set("include_image_language", "en,null");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} for movie ${tmdbId}`);
  return res.json() as Promise<Detail>;
}

async function main() {
  const movies = await prisma.movie.findMany({
    where: { tmdbId: { not: null } },
    select: {
      id: true, tmdbId: true, title: true, trailerKey: true,
      posterPath: true, backdropPath: true,
      _count: { select: { images: true, videos: true } },
    },
    orderBy: { title: "asc" },
  });

  for (const m of movies) {
    const d = await detail(m.tmdbId!);
    const cast = (d.credits?.cast ?? []).slice(0, 20);
    const seen = new Set<string>();
    const crew = (d.credits?.crew ?? [])
      .filter((c) => KEY_CREW_JOBS.has(c.job))
      .filter((c) => {
        const k = `${c.id}:${c.job}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 12);

    const rank = (type: string, official: boolean) =>
      (type === "Trailer" ? 3 : type === "Teaser" ? 2 : type === "Clip" ? 1 : 0) + (official ? 1 : 0);
    const seenVideos = new Set<string>();
    const videos = (d.videos?.results ?? [])
      .filter((v) => v.site === "YouTube" && VIDEO_TYPES.has(v.type))
      .filter((v) => (seenVideos.has(v.key) ? false : (seenVideos.add(v.key), true)))
      .sort((a, b) => rank(b.type, b.official) - rank(a.type, a.official)
        || (b.published_at ?? "").localeCompare(a.published_at ?? ""))
      .slice(0, 8);

    const pick = (list: NonNullable<Detail["images"]>["posters"] | undefined, n: number) =>
      (list ?? []).slice().sort((a, b) => b.vote_average - a.vote_average).slice(0, n);
    const artwork = [
      ...pick(d.images?.posters, 10).map((p, i) => ({ kind: "poster" as const, path: p.file_path, lang: p.iso_639_1, sort: i })),
      ...pick(d.images?.backdrops, 8).map((b, i) => ({ kind: "backdrop" as const, path: b.file_path, lang: b.iso_639_1, sort: i })),
    ];

    await prisma.$transaction(async (tx) => {
      await tx.movieCast.deleteMany({ where: { movieId: m.id } });
      await tx.movieCrew.deleteMany({ where: { movieId: m.id } });
      if (cast.length > 0) {
        await tx.movieCast.createMany({
          data: cast.map((c) => ({
            movieId: m.id, tmdbPersonId: c.id, name: c.name,
            character: c.character, profilePath: c.profile_path, order: c.order,
          })),
        });
      }
      if (crew.length > 0) {
        await tx.movieCrew.createMany({
          data: crew.map((c) => ({
            movieId: m.id, tmdbPersonId: c.id, name: c.name,
            job: c.job, department: c.department, profilePath: c.profile_path,
          })),
        });
      }
      // Fill-only: never clobber curated media.
      if (m._count.images === 0 && artwork.length > 0) {
        await tx.movieImage.createMany({ data: artwork.map((a) => ({ movieId: m.id, ...a })) });
      }
      if (m._count.videos === 0 && videos.length > 0) {
        await tx.movieVideo.createMany({
          data: videos.map((v, i) => ({
            movieId: m.id, youtubeKey: v.key, name: v.name ?? v.type, type: v.type,
            official: v.official, publishedAt: v.published_at ? new Date(v.published_at) : null, sort: i,
          })),
        });
      }
      await tx.movie.update({
        where: { id: m.id },
        data: {
          trailerKey: m.trailerKey ?? videos[0]?.key ?? null,
          posterPath: m.posterPath ?? d.poster_path,
          backdropPath: m.backdropPath ?? d.backdrop_path,
        },
      });
    });

    const withPhoto = cast.filter((c) => c.profile_path).length;
    console.log(
      `${m.title}: ${cast.length} cast (${withPhoto} with photos), ${crew.length} crew` +
        `${m._count.images === 0 ? `, +${artwork.length} artwork` : ""}` +
        `${m._count.videos === 0 ? `, +${videos.length} videos` : ""}`,
    );
    // Stay well under TMDB's rate limits.
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`Refreshed ${movies.length} movies.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
