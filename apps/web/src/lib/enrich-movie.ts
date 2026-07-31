import { prisma } from "@cinepixo/db";
import { fetchRemoteImage, processImage } from "@/lib/media/image";
import { buildKey, putPublicObject } from "@/lib/media/storage";

/**
 * One film, filled from everything the open sources will give — on demand.
 *
 * The batch lanes fill the library at their own pace; this is the desk's
 * button for the film somebody is looking at right now: a new release, a page
 * a reader complained about, the film tonight's review needs dressed. One call
 * walks the same sources the lanes do — Wikidata for facts, the film's own
 * Wikipedia article for the synopsis and the poster — and, like the lanes, it
 * is fill-only: nothing already present is touched, so pressing the button
 * twice is safe and pressing it after an operator upload changes nothing.
 *
 * Provenance rules ride along unchanged: a synopsis lands with its article and
 * licence, a poster with the identification credit, both enforced by CHECKs.
 */

const SPARQL = "https://query.wikidata.org/sparql";
const WIKIPEDIA_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary";
const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "CinePixo/0.1 (https://cinepixo.com; devoh@signpost.kr) node-fetch";
const WIKI_LICENSE = "CC BY-SA 4.0";

type Binding = Record<string, { value: string } | undefined>;

async function ask(query: string): Promise<Binding[]> {
  const res = await fetch(SPARQL, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ query }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const json = (await res.json()) as { results: { bindings: Binding[] } };
  return json.results.bindings;
}

const labelled = (v: string | undefined) => (v && !/^Q[1-9][0-9]*$/.test(v) ? v : null);
const youtubeKey = (v: string | undefined) => (v && /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null);

function articleTitle(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const raw = path.startsWith("/wiki/") ? path.slice("/wiki/".length) : null;
    return raw ? decodeURIComponent(raw).replace(/_/g, " ") : null;
  } catch {
    return null;
  }
}

export interface EnrichReport {
  filled: string[];
}

export async function enrichMovie(movieId: string): Promise<EnrichReport> {
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    select: {
      id: true,
      wikidataId: true,
      wikipediaUrl: true,
      overview: true,
      image: true,
      originalLanguage: true,
      certification: true,
      collectionName: true,
      homepage: true,
      trailerKey: true,
      companies: true,
      runtime: true,
    },
  });
  if (!movie) throw new Error("movie not found");

  const filled: string[] = [];
  const data: Record<string, unknown> = {};

  // ── The article, if we do not know it yet ──
  let articleUrl = movie.wikipediaUrl;
  if (!articleUrl && movie.wikidataId) {
    const rows = await ask(`
SELECT ?article WHERE {
  ?article schema:about wd:${movie.wikidataId} ; schema:isPartOf <https://en.wikipedia.org/> .
} LIMIT 1`);
    articleUrl = rows[0]?.article?.value ?? null;
    if (articleUrl) {
      data.wikipediaUrl = articleUrl;
      filled.push("article");
    }
  }

  // ── Facts, one query ──
  if (movie.wikidataId) {
    const rows = await ask(`
SELECT ?film
       (GROUP_CONCAT(DISTINCT ?languageName; separator="; ") AS ?languages)
       (SAMPLE(?ratingName) AS ?rating)
       (SAMPLE(?seriesName) AS ?series)
       (SAMPLE(?site) AS ?website)
       (SAMPLE(?youtube) AS ?trailer)
       (SAMPLE(?minutes) AS ?runtime)
       (GROUP_CONCAT(DISTINCT ?companyName; separator="; ") AS ?companies)
WHERE {
  VALUES ?film { wd:${movie.wikidataId} }
  OPTIONAL { ?film wdt:P364 ?language . ?language rdfs:label ?languageName . FILTER(LANG(?languageName) = "en") }
  OPTIONAL { ?film wdt:P1657 ?ratingItem . ?ratingItem rdfs:label ?ratingName . FILTER(LANG(?ratingName) = "en") }
  OPTIONAL { ?film wdt:P179 ?seriesItem . ?seriesItem rdfs:label ?seriesName . FILTER(LANG(?seriesName) = "en") }
  OPTIONAL { ?film wdt:P856 ?site }
  OPTIONAL { ?film wdt:P1651 ?youtube }
  OPTIONAL { ?film wdt:P2047 ?minutes }
  OPTIONAL { ?film wdt:P272 ?company . ?company rdfs:label ?companyName . FILTER(LANG(?companyName) = "en") }
}
GROUP BY ?film`);
    const b = rows[0];
    if (b) {
      const language =
        (b.languages?.value ?? "")
          .split(";")
          .map((l) => l.trim())
          .filter((l) => l && !/^Q[1-9][0-9]*$/.test(l))
          .slice(0, 3)
          .join(", ") || null;
      const companies = (b.companies?.value ?? "")
        .split(";")
        .map((c) => c.trim())
        .filter((c) => c && !/^Q[1-9][0-9]*$/.test(c))
        .slice(0, 8)
        .map((name) => ({ name, logoPath: null }));
      const rating = labelled(b.rating?.value);
      const series = labelled(b.series?.value);
      const website = b.website?.value;
      const trailer = youtubeKey(b.trailer?.value);
      const minutes = Math.round(Number(b.runtime?.value));

      if (!movie.originalLanguage && language) (data.originalLanguage = language), filled.push("language");
      if (!movie.certification && rating) (data.certification = rating), filled.push("rating");
      if (!movie.collectionName && series) (data.collectionName = series), filled.push("series");
      if (!movie.homepage && website?.startsWith("http"))
        (data.homepage = website.slice(0, 500)), filled.push("website");
      if (!movie.trailerKey && trailer) (data.trailerKey = trailer), filled.push("trailer");
      if (!movie.runtime && Number.isFinite(minutes) && minutes > 0 && minutes <= 1200)
        (data.runtime = minutes), filled.push("runtime");
      const hasCompanies = Array.isArray(movie.companies) && movie.companies.length > 0;
      if (!hasCompanies && companies.length > 0) (data.companies = companies), filled.push("companies");
    }
  }

  // ── The synopsis, with its licence ──
  if (!movie.overview && articleUrl) {
    const title = articleTitle(articleUrl);
    if (title) {
      const res = await fetch(`${WIKIPEDIA_SUMMARY}/${encodeURIComponent(title)}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          extract?: string;
          content_urls?: { desktop?: { page?: string } };
        };
        const extract = json.extract?.trim();
        if (extract) {
          data.overview = extract.slice(0, 1200);
          data.overviewSourceUrl = json.content_urls?.desktop?.page ?? articleUrl;
          data.overviewLicense = WIKI_LICENSE;
          filled.push("synopsis");
        }
      }
    }
  }

  // ── The poster, from the article's lead image ──
  if (!movie.image && articleUrl) {
    const title = articleTitle(articleUrl);
    if (title) {
      const api = new URL(WIKIPEDIA_API);
      api.searchParams.set("action", "query");
      api.searchParams.set("titles", title);
      api.searchParams.set("prop", "pageimages");
      api.searchParams.set("piprop", "original");
      api.searchParams.set("pilicense", "any");
      api.searchParams.set("redirects", "1");
      api.searchParams.set("format", "json");
      api.searchParams.set("formatversion", "2");
      const res = await fetch(api, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          query?: { pages?: { original?: { source?: string } }[] };
        };
        const src = json.query?.pages?.[0]?.original?.source;
        if (src) {
          const buf = await fetchRemoteImage(src);
          const processed = await processImage(buf, { fullWidth: 780 });
          const url = await putPublicObject(
            buildKey("films", processed.ext),
            processed.full.data,
            processed.contentType,
          );
          data.image = url;
          data.imageCredit = "© the film's rights holders";
          data.imageLicense = "Poster shown for identification";
          data.imageSourceUrl = articleUrl;
          filled.push("poster");
        }
      }
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.movie.update({ where: { id: movie.id }, data });
  }
  return { filled };
}
