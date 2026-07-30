/**
 * Wikipedia and Wikidata, as a source for the things anyone can look up.
 *
 * Chosen over a film database for this job because it needs no key, its
 * photographs are licensed rather than merely available, and it answers the
 * questions a reference page has to answer — born, died, where, what they do —
 * with structured claims instead of prose to be parsed.
 *
 * The split matters and is deliberate:
 *
 *   · **facts** (dates, birthplace, occupations, identifiers) are imported.
 *     A birth date is not authorship; it is the same in every source.
 *   · **the photograph** is imported, and its credit and licence are imported
 *     *with* it. A Commons image is CC-licensed, not free of obligation, so the
 *     attribution is stored beside the object and rendered on the page.
 *   · **the prose is not imported.** The article extract comes back as a draft
 *     for a person to read and rewrite, never written to `bio`. Wikipedia text
 *     is CC BY-SA, and a page whose description was pasted from an encyclopedia
 *     has nothing of this site in it.
 *
 * Wikimedia asks that clients identify themselves; the User-Agent below is that
 * courtesy, not decoration. Every call is bounded and every failure is a null
 * rather than a throw, because enrichment is an improvement and must never be
 * the reason a request fails.
 */

const UA = "CinePixo/1.0 (https://cinepixo.com) film-criticism site";
const WP = "https://en.wikipedia.org";
const WD = "https://www.wikidata.org/w/api.php";
const COMMONS = "https://commons.wikimedia.org/w/api.php";

async function json<T>(url: string, timeoutMs = 8_000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ── Search ──────────────────────────────────────────────────── */

export interface WikiCandidate {
  title: string;
  /** Wikipedia's own one-liner: "American filmmaker (born 1985)". */
  description: string | null;
  extract: string | null;
  thumbnail: string | null;
  wikidataId: string | null;
  pageUrl: string;
}

interface SummaryResponse {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  wikibase_item?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

/** The article for an exact title, or null when there isn't one. */
async function summary(title: string): Promise<SummaryResponse | null> {
  const data = await json<SummaryResponse>(
    `${WP}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  );
  // A disambiguation page is not a person; treating it as one would attach the
  // wrong photo to the wrong name, which is the failure mode this whole path
  // exists to avoid.
  if (!data || data.type === "disambiguation") return null;
  return data;
}

interface SearchResponse {
  query?: { search?: { title: string }[] };
}

/**
 * Candidates for a name, best guess first.
 *
 * The name is searched rather than assumed as a title: "Bong Joon-ho" is an
 * article, "Bong Joon Ho" is not, and a credit can be spelled either way. Each
 * candidate is then summarised so the caller can show a face and a one-line
 * description — enough to tell two people with one name apart.
 */
export async function searchPeople(name: string, limit = 6): Promise<WikiCandidate[]> {
  const search = await json<SearchResponse>(
    `${WP}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}` +
      `&srlimit=${limit}&srnamespace=0&format=json&origin=*`,
  );
  const titles = (search?.query?.search ?? []).map((r) => r.title);
  if (titles.length === 0) return [];

  const summaries = await Promise.all(titles.map((t) => summary(t)));

  return summaries
    .map((s, i) =>
      s
        ? {
            title: s.title ?? titles[i],
            description: s.description ?? null,
            extract: s.extract ?? null,
            thumbnail: s.thumbnail?.source ?? null,
            wikidataId: s.wikibase_item ?? null,
            pageUrl:
              s.content_urls?.desktop?.page ??
              `${WP}/wiki/${encodeURIComponent((s.title ?? titles[i]).replace(/ /g, "_"))}`,
          }
        : null,
    )
    .filter((c): c is WikiCandidate => c !== null);
}

/* ── Structured facts ────────────────────────────────────────── */

interface WdEntities {
  entities?: Record<
    string,
    {
      claims?: Record<
        string,
        { mainsnak?: { datavalue?: { value?: unknown } } }[]
      >;
      labels?: Record<string, { value?: string }>;
    }
  >;
}

const claimValue = (
  claims: NonNullable<NonNullable<WdEntities["entities"]>[string]["claims"]>,
  property: string,
): unknown => claims[property]?.[0]?.mainsnak?.datavalue?.value;

/** Wikidata times look like "+1985-01-19T00:00:00Z"; we want the day. */
function wikidataDay(value: unknown): string | null {
  const time = (value as { time?: string } | undefined)?.time;
  const m = time ? /^\+(\d{4})-(\d{2})-(\d{2})/.exec(time) : null;
  // Wikidata uses 00 for an unknown month or day. A date we cannot place in the
  // calendar is not a date we should print.
  if (!m || m[2] === "00" || m[3] === "00") return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

const qid = (value: unknown): string | null =>
  (value as { id?: string } | undefined)?.id ?? null;

/** Human-readable labels for a batch of Q-ids, in one request. */
async function labelsFor(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)].filter(Boolean).slice(0, 50);
  if (unique.length === 0) return out;

  const data = await json<WdEntities>(
    `${WD}?action=wbgetentities&ids=${unique.join("|")}&props=labels&languages=en&format=json&origin=*`,
  );
  for (const [id, entity] of Object.entries(data?.entities ?? {})) {
    const label = entity.labels?.en?.value;
    if (label) out.set(id, label);
  }
  return out;
}

export interface WikiFacts {
  wikidataId: string;
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  occupations: string[];
  imdbId: string | null;
  /** Commons file name for the portrait, e.g. "Damien Chazelle (cropped).jpg". */
  imageFile: string | null;
}

export async function facts(wikidataId: string): Promise<WikiFacts | null> {
  if (!/^Q[1-9][0-9]*$/.test(wikidataId)) return null;

  const data = await json<WdEntities>(
    `${WD}?action=wbgetentities&ids=${wikidataId}&props=claims&format=json&origin=*`,
  );
  const claims = data?.entities?.[wikidataId]?.claims;
  if (!claims) return null;

  const placeId = qid(claimValue(claims, "P19"));
  const occupationIds = (claims.P106 ?? [])
    .map((c) => qid(c.mainsnak?.datavalue?.value))
    .filter((id): id is string => Boolean(id))
    .slice(0, 6);

  const labels = await labelsFor([placeId, ...occupationIds].filter((v): v is string => Boolean(v)));

  const imdb = claimValue(claims, "P345");

  return {
    wikidataId,
    birthDate: wikidataDay(claimValue(claims, "P569")),
    deathDate: wikidataDay(claimValue(claims, "P570")),
    birthPlace: placeId ? (labels.get(placeId) ?? null) : null,
    occupations: occupationIds
      .map((id) => labels.get(id))
      .filter((l): l is string => Boolean(l)),
    imdbId: typeof imdb === "string" && /^nm\d{4,12}$/.test(imdb) ? imdb : null,
    imageFile: typeof claimValue(claims, "P18") === "string"
      ? (claimValue(claims, "P18") as string)
      : null,
  };
}

/* ── The photograph, with its obligations ────────────────────── */

export interface CommonsImage {
  /** Full-resolution file URL on upload.wikimedia.org. */
  url: string;
  /** Author, as plain text — the API returns it wrapped in a link. */
  credit: string | null;
  license: string | null;
  licenseUrl: string | null;
  /** The Commons file page, which is where a reader should be sent. */
  sourceUrl: string;
}

interface CommonsResponse {
  query?: {
    pages?: Record<
      string,
      {
        imageinfo?: {
          url?: string;
          descriptionurl?: string;
          extmetadata?: Record<string, { value?: string }>;
        }[];
      }
    >;
  };
}

/** Strip the anchor tags Commons wraps its metadata values in. */
function plain(value: string | undefined): string | null {
  if (!value) return null;
  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

export async function commonsImage(fileName: string): Promise<CommonsImage | null> {
  const title = `File:${fileName}`;
  const data = await json<CommonsResponse>(
    `${COMMONS}?action=query&titles=${encodeURIComponent(title)}` +
      `&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`,
  );
  const page = Object.values(data?.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.url) return null;

  const meta = info.extmetadata ?? {};
  return {
    url: info.url,
    credit: plain(meta.Artist?.value) ?? plain(meta.Credit?.value),
    license: plain(meta.LicenseShortName?.value),
    licenseUrl: plain(meta.LicenseUrl?.value),
    sourceUrl:
      info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

/* ── One call the admin can make ─────────────────────────────── */

export interface Enrichment {
  candidate: WikiCandidate;
  facts: WikiFacts | null;
  image: CommonsImage | null;
  /**
   * The article's opening paragraphs, for a person to read and rewrite. Never
   * saved as `bio` — CC BY-SA, and the prose is supposed to be ours.
   */
  bioDraft: string | null;
}

/** Everything about one Wikipedia article, gathered in as few calls as possible. */
export async function enrich(title: string): Promise<Enrichment | null> {
  const s = await summary(title);
  if (!s?.title) return null;

  const candidate: WikiCandidate = {
    title: s.title,
    description: s.description ?? null,
    extract: s.extract ?? null,
    thumbnail: s.thumbnail?.source ?? null,
    wikidataId: s.wikibase_item ?? null,
    pageUrl:
      s.content_urls?.desktop?.page ??
      `${WP}/wiki/${encodeURIComponent(s.title.replace(/ /g, "_"))}`,
  };

  const f = candidate.wikidataId ? await facts(candidate.wikidataId) : null;

  // Prefer Wikidata's declared image; fall back to whatever the article leads
  // with, which is the same file in practice but not guaranteed.
  const image = f?.imageFile
    ? await commonsImage(f.imageFile)
    : s.originalimage?.source
      ? {
          url: s.originalimage.source,
          credit: null,
          license: null,
          licenseUrl: null,
          sourceUrl: candidate.pageUrl,
        }
      : null;

  return { candidate, facts: f, image, bioDraft: candidate.extract };
}
