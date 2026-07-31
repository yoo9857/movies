// Every film's poster, from its own Wikipedia article — onto our storage.
//
//   npm run posters -w web -- --limit=500
//   npm run posters -w web -- --film=spider-man-brand-new-day-2026
//
// Owner's decision (2026-07-31): posters are displayed site-wide for
// identification, the way film databases and review sites do. The source that
// makes this accurate at scale is not an image search — it is the film's own
// article: we already store `wikipediaUrl` per film, and the article's lead
// image is the theatrical poster for essentially every film page on Wikipedia.
// The same match that gave the film its synopsis gives it its poster, so the
// wrong film's artwork cannot land here.
//
// Files are fetched once, re-encoded, and stored under our own key like every
// other image. Provenance still travels: the source URL is the article, and
// the credit line names the rights holders — a poster is identification, not
// something we claim. Films that already carry artwork (the freely licensed
// Commons imports, or an operator upload) are never touched: fill-only.
import "../../../packages/db/prisma/env";
import { prisma } from "@cinepixo/db";
import { fetchRemoteImage, processImage } from "@/lib/media/image";
import { buildKey, putPublicObject } from "@/lib/media/storage";

const API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "CinePixo/0.1 (https://cinepixo.com; devoh@signpost.kr) node-fetch";

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
/** upload.wikimedia.org throttles image fetches; 1200ms held for the portraits. */
const PACE = arg("pace", 1200);
const FILM = strArg("film");
const DRY = process.argv.includes("--dry");

/** "https://en.wikipedia.org/wiki/Oldboy_(2003_film)" → "Oldboy (2003 film)" */
function articleTitle(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const raw = path.startsWith("/wiki/") ? path.slice("/wiki/".length) : null;
    return raw ? decodeURIComponent(raw).replace(/_/g, " ") : null;
  } catch {
    return null;
  }
}

/** The article's lead image at full size — the infobox poster, in practice. */
async function leadImage(title: string): Promise<string | null> {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "original");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    query?: { pages?: { original?: { source?: string } }[] };
  };
  return json.query?.pages?.[0]?.original?.source ?? null;
}

async function main() {
  console.log(`Wikipedia → posters: up to ${FILM ?? LIMIT}${DRY ? " (dry run)" : ""}`);

  const films = await prisma.movie.findMany({
    where: FILM
      ? { slug: FILM }
      : { image: null, wikipediaUrl: { not: null } },
    orderBy: [{ wikidataSitelinks: "desc" }, { releaseDate: "desc" }],
    take: FILM ? 1 : LIMIT,
    select: { id: true, slug: true, title: true, wikipediaUrl: true },
  });
  if (films.length === 0) {
    console.log("No film with an article is missing a poster. Nothing to do.");
    return;
  }
  console.log(`${films.length} films to try. First: ${films[0].title}\n`);

  let stored = 0;
  let noImage = 0;
  const failed: string[] = [];

  for (const film of films) {
    const title = film.wikipediaUrl ? articleTitle(film.wikipediaUrl) : null;
    if (!title) {
      failed.push(`${film.title}: unreadable article URL`);
      continue;
    }
    try {
      const src = await leadImage(title);
      if (!src) {
        noImage += 1;
      } else if (!DRY) {
        const buf = await fetchRemoteImage(src);
        // Poster-shaped, so no square crop; 780 is the widest size any page asks for.
        const processed = await processImage(buf, { fullWidth: 780 });
        const url = await putPublicObject(
          buildKey("films", processed.ext),
          processed.full.data,
          processed.contentType,
        );
        await prisma.movie.update({
          where: { id: film.id },
          data: {
            image: url,
            imageCredit: "© the film's rights holders",
            imageLicense: "Poster shown for identification",
            imageSourceUrl: film.wikipediaUrl,
          },
        });
        stored += 1;
        if (stored % 25 === 0) console.log(`  ${stored} stored · ${noImage} without a lead image`);
      } else {
        console.log(`would store: ${film.title} ← ${src}`);
        stored += 1;
      }
    } catch (e) {
      failed.push(`${film.title}: ${(e as Error).message.slice(0, 120)}`);
    }
    await new Promise((r) => setTimeout(r, PACE));
  }

  console.log(`\nStored ${stored} · no lead image for ${noImage} · failed ${failed.length}`);
  for (const line of failed.slice(0, 12)) console.warn(`  ${line}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
