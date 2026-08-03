/**
 * What to call a person, decided by the films we actually hold.
 *
 * Wikidata's P106 is the richer vocabulary — "cinematographer", "film editor",
 * "stage actor" — so it stays the source of the words. What it cannot supply is
 * an order: the importer collects occupations into a set and SPARQL returns them
 * in whatever order it likes, which is how Destin Daniel Cretton's page came to
 * be titled "film screenwriter". Search Console shows people typing the role
 * themselves — "director terence young", "nirav shah cinematographer", "actor
 * alexander knox" — which is what you do when a bare name is ambiguous, and a
 * 208,000-person credit graph is full of namesakes.
 *
 * Our credit graph does know the order: it records what each person was credited
 * *for* on the films in this library, and the job they hold most is the one a
 * reader means. So Wikidata's labels are ranked by how often our own credits
 * agree, and a job our credits name that Wikidata omitted is appended rather
 * than dropped.
 *
 * The bridge between the two vocabularies is an explicit table, not string
 * similarity, because the credits are a closed set of six labels and similarity
 * gets them wrong in both directions: "Director of Photography" contains the
 * word "director", so a cinematographer would be ranked a director — and half
 * the person queries this site is shown for are cinematographers. Meanwhile
 * "Screenplay" and "screenwriter" share no word at all, so the real match would
 * have been missed.
 */

/** Lowercase, letters and spaces only, so labels compare on words. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

const hasWord = (haystack: string, word: string) =>
  ` ${haystack} `.includes(` ${word} `);

/**
 * Our credit labels, and the occupation words each one supports.
 *
 * `MovieCrew.job` holds exactly six values across 465,383 rows — Director,
 * Screenplay, Producer, Original Music Composer, Director of Photography,
 * Editor — plus cast credits, which we call "actor". Keeping this table explicit
 * means adding a seventh credit label is a visible decision rather than a silent
 * change in what every page calls somebody.
 *
 * `not` exists for one real collision: the occupation "director of photography"
 * would otherwise also satisfy the plain Director credit.
 */
const CREDIT_CONCEPTS: { credit: string; words: string[]; not?: string[] }[] = [
  { credit: "actor", words: ["actor", "actress"] },
  { credit: "Director of Photography", words: ["cinematographer", "photography"] },
  { credit: "Director", words: ["director", "filmmaker"], not: ["photography"] },
  { credit: "Screenplay", words: ["screenwriter", "screenplay", "writer", "playwright"] },
  { credit: "Producer", words: ["producer"] },
  { credit: "Original Music Composer", words: ["composer", "songwriter"] },
  { credit: "Editor", words: ["editor"] },
];

/** True when an occupation label names the job a credit label records. */
function supports(occupation: string, credit: string): boolean {
  const entry = CREDIT_CONCEPTS.find((c) => c.credit === credit);
  if (!entry) return false;
  const o = norm(occupation);
  if (entry.not?.some((w) => hasWord(o, w))) return false;
  return entry.words.some((w) => hasWord(o, w));
}

export interface RoleInput {
  /** Wikidata P106 labels, in the arbitrary order the importer received them. */
  occupations: readonly string[];
  /** How many films they appear in as cast. */
  castCredits: number;
  /** One entry per crew credit, holding our own `MovieCrew.job` label. */
  crewJobs: readonly string[];
}

/**
 * Roles worth naming, most-practised first.
 *
 * Returns `[]` when we know nothing at all, so callers can decide what to say
 * then — "film worker" reads acceptably in a title and poorly as a JSON-LD
 * `jobTitle`.
 */
export function rankedRoles({ occupations, castCredits, crewJobs }: RoleInput): string[] {
  const evidence = new Map<string, number>();
  if (castCredits > 0) evidence.set("actor", castCredits);
  for (const job of crewJobs) {
    if (!job) continue;
    evidence.set(job, (evidence.get(job) ?? 0) + 1);
  }

  const scoreOf = (occupation: string) => {
    let score = 0;
    for (const [credit, count] of evidence) {
      if (supports(occupation, credit)) score += count;
    }
    return score;
  };

  // One ranking over both vocabularies, because the credits are the evidence and
  // an occupation nothing backs must not outrank a job we hold forty of. That was
  // the first version's bug: it emitted every Wikidata label before any credit
  // label, so a stray "film producer" led the page of a career cinematographer.
  //
  // Ties go to Wikidata's wording — "cinematographer" reads better than "Director
  // of Photography" — and within each vocabulary the original order stands, so
  // nothing shuffles between renders of one page.
  const candidates = [
    ...occupations.map((label, i) => ({ label, rank: i, score: scoreOf(label) })),
    // A job our credits name that no occupation covers. Our labels are already
    // title-case, which is what the page renders; "actor" is ours, so it is not.
    ...[...evidence.entries()]
      .filter(([credit]) => !occupations.some((o) => supports(o, credit)))
      .map(([credit, count], i) => ({
        label: credit === "actor" ? "Actor" : credit,
        rank: occupations.length + i,
        score: count,
      })),
  ];

  return candidates.sort((a, b) => b.score - a.score || a.rank - b.rank).map((c) => c.label);
}

/** The one role a title should carry, or null when we have nothing to say. */
export function leadRole(input: RoleInput): string | null {
  return rankedRoles(input)[0] ?? null;
}
