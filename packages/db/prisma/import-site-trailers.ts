// Trailers from each film's own official website.
//
//   npm run db:import-site-trailers -- --dry --limit=40
//   npm run db:import-site-trailers -- --limit=11000
//
// Every free source of trailer ids is exhausted: Wikidata's P1651 gave all
// 7,673 it has, P10 gave the public-domain reels of the 1950s, and a film's
// Wikipedia article yields a real trailer 4% of the time and fan commentary the
// rest. What is left, and what needs no API key, is the page the distributor
// built for the film: 12,593 of these films carry an official site in `homepage`
// and 10,809 of those still have no trailer.
//
// The match is safe by construction, the way the poster pass is safe: we are
// reading the film's own site, so the trailer on it is the film's own trailer.
//
// Except when it is not — and this is the whole difficulty. A distributor's
// "official site" is often a hub: marvel.com/movies/... carries 142 videos and
// the Rogue One page 153, most of them for other pictures. So a candidate has
// to clear three gates before it is believed:
//
//   1. YouTube's own oEmbed must answer — a dead or private id is worse than
//      no trailer, because the page renders its thumbnail as a grey box.
//   2. The video's real title must name *this* film. This is the gate that
//      stops a Marvel hub page hanging the Thor trailer on Ant-Man.
//   3. It must be a trailer and not the merchandise around one. "The Martian:
//      VR Experience | Trailer" passed the first two gates in testing and is
//      not the film's trailer.
import "./env";
import { prisma } from "../src/index";

const OEMBED = "https://www.youtube.com/oembed";
// Distributor sites serve very different HTML to something that admits to being
// a bot; this is honest about who we are while still being a browser string.
const USER_AGENT =
  "Mozilla/5.0 (compatible; CinePixo/0.1; +https://cinepixo.com; devoh@signpost.kr)";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}
function strArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const LIMIT = arg("limit", 500);
/** Milliseconds between films. Mostly distinct hosts, so this is politeness. */
const PACE = arg("pace", 800);
/** Candidate ids to check per page. A hub page has 150; we do not want 150. */
const MAX_CANDIDATES = arg("candidates", 8);
const FILM = strArg("film");
const DRY = process.argv.includes("--dry");
/**
 * Earliest release year to bother with. Sorted by notability alone the queue
 * opens on 1959 Disney pictures whose `homepage` is a studio catalogue entry
 * with no video on it at all — 30 of those returned nothing. A film has a site
 * carrying its own trailer roughly from the moment films had sites.
 */
const SINCE = arg("since", 2000);

/** Lowercase alphanumerics and single spaces — for comparing two titles. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Things that are a trailer for something adjacent to the film.
 *
 * Measured, not imagined: the first sample run accepted "The Martian: VR
 * Experience | Trailer" from foxmovies.com — a real trailer, for a VR tie-in.
 */
const NOT_THE_FILM =
  /\bvr\b|video game|game ?play|soundtrack|behind the scenes|making of|featurette|interview|cast|bloopers?|deleted scene|reaction|review|podcast|episode|season \d|tv spot for|toy|lego/i;

/** A YouTube id is 11 characters; anything else in a URL slot is not one. */
const KEY = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;

function candidateKeys(html: string): string[] {
  // Keys arrive inside JSON blobs and inline scripts as often as in <iframe>,
  // where the slashes are escaped; unescaping first finds both spellings.
  const flat = html.replace(/\\\//g, "/").replace(/&amp;/g, "&");
  return [...new Set([...flat.matchAll(KEY)].map((m) => m[1]))];
}

interface Video {
  key: string;
  title: string;
  channel: string;
}

/** The video as YouTube describes it, or null if it is gone. */
async function describe(key: string): Promise<Video | null> {
  const url = `${OEMBED}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${key}`)}&format=json`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { title?: string; author_name?: string };
    if (!json.title) return null;
    return { key, title: json.title.trim(), channel: json.author_name ?? "" };
  } catch {
    return null;
  }
}

/**
 * Is this video the trailer for this film?
 *
 * The title test is a substring of normalised forms, which is deliberately
 * strict: "Bohemian Rhapsody | Final Trailer [HD] | 20th Century FOX" contains
 * "bohemian rhapsody", and Thor's trailer on a Marvel hub page does not contain
 * "ant man and the wasp". Short titles ride on the fact that we are already on
 * the film's own site, so the population being filtered is small and related.
 */
function isTrailerFor(video: Video, filmTitle: string): boolean {
  if (!/trailer|teaser/i.test(video.title)) return false;
  if (NOT_THE_FILM.test(video.title)) return false;
  const title = normalise(filmTitle);
  // A one- or two-character title cannot be matched this way without matching
  // everything; those films wait for a source that carries an id.
  if (title.length < 3) return false;
  return normalise(video.title).includes(title);
}

async function main() {
  console.log(`Official sites → trailers: up to ${FILM ?? LIMIT}${DRY ? " (dry run)" : ""}`);

  const films = await prisma.movie.findMany({
    where: FILM
      ? { slug: FILM }
      : {
          homepage: { not: null },
          trailerKey: null,
          releaseDate: { gte: new Date(Date.UTC(SINCE, 0, 1)) },
        },
    orderBy: [{ wikidataSitelinks: "desc" }, { releaseDate: "desc" }],
    take: FILM ? 1 : LIMIT,
    select: { id: true, slug: true, title: true, homepage: true },
  });

  if (films.length === 0) {
    console.log("Every film with an official site already has a trailer. Nothing to do.");
    return;
  }
  console.log(`${films.length.toLocaleString("en-US")} to try. First: ${films[0].title}\n`);

  let stored = 0;
  let dead = 0;
  let noVideo = 0;
  let rejected = 0;

  for (const film of films) {
    let html: string;
    try {
      const res = await fetch(film.homepage!, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(15_000),
        redirect: "follow",
      });
      if (!res.ok) {
        dead += 1;
        continue;
      }
      html = await res.text();
    } catch {
      dead += 1;
      continue;
    }

    const keys = candidateKeys(html);
    if (keys.length === 0) {
      noVideo += 1;
      await new Promise((r) => setTimeout(r, PACE));
      continue;
    }

    let hit: Video | null = null;
    for (const key of keys.slice(0, MAX_CANDIDATES)) {
      const video = await describe(key);
      if (video && isTrailerFor(video, film.title)) {
        hit = video;
        break;
      }
    }

    if (!hit) {
      rejected += 1;
    } else if (DRY) {
      stored += 1;
      console.log(`would fill ${film.slug} ← ${hit.title.slice(0, 62)}  [${hit.channel}]`);
    } else {
      await prisma.movie.update({
        where: { id: film.id },
        data: { trailerKey: hit.key },
      });
      stored += 1;
      console.log(`  ${film.slug} ← ${hit.title.slice(0, 58)}`);
      if (stored % 25 === 0) {
        console.log(`  — ${stored} filled · ${dead} dead sites · ${rejected} nothing matched`);
      }
    }

    await new Promise((r) => setTimeout(r, PACE));
  }

  const total = await prisma.movie.count({ where: { trailerKey: { not: null } } });
  console.log(
    `\nFilled ${stored} · ${dead} sites unreachable · ${noVideo} with no YouTube · ` +
      `${rejected} had videos but none was this film's trailer`,
  );
  console.log(`Films with a trailer: ${total.toLocaleString("en-US")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
