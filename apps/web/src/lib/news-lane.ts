/**
 * Choosing what the automatic news lane writes about.
 *
 * The lane runs unattended twice a day, so everything here answers one
 * question: **is this story new, and is it a story we can illustrate and link?**
 * Nothing in this file touches the network or the database — that is the
 * script's job — so the judgements it makes are the ones a test can pin.
 *
 * The rule that matters most is the duplicate rule, and it is not fuzzy: a
 * story whose coverage we have already cited is a story we have already
 * written. `Post.sources` is the exact record of that, so URL identity is the
 * first gate and title similarity only catches the near-misses that a
 * different outlet's link would slip past.
 */

/** Words that carry no signal in a headline, and would inflate any overlap. */
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has",
  "have", "his", "her", "in", "into", "is", "it", "its", "not", "of", "on", "or",
  "that", "the", "their", "this", "to", "was", "were", "what", "when", "who",
  "will", "with", "you", "your", "after", "before", "over", "than", "then",
  "they", "them", "how", "why", "about", "just", "still", "more", "most",
]);

/**
 * A URL reduced to what identifies the article.
 *
 * Two outlets link the same piece with different tracking, and a syndicate
 * carries it on a third host — the query string and a trailing slash are noise,
 * the host and path are not. `www.` goes because Bing hands back both forms.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** The words of a headline worth comparing — lowercase, no punctuation, no filler. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9가-힣\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

/**
 * How much of the shorter headline the longer one already contains.
 *
 * Containment rather than Jaccard: "Spider-Man Brand New Day Passes $1.6
 * Billion" and "Inside Spider-Man: Brand New Day's $1.67 Billion Ten-Day Box
 * Office Run" are the same story told at different lengths, and Jaccard scores
 * that pair low precisely because one side is longer.
 */
export function overlapRatio(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size === 0) return 0;
  let hits = 0;
  for (const t of small) if (large.has(t)) hits++;
  return hits / small.size;
}

/** Two headlines the site should not carry twice. Tuned on the 44 posts that existed. */
export const DUPLICATE_OVERLAP = 0.6;

export function isNearDuplicate(
  title: string,
  existing: Set<string>[],
  threshold = DUPLICATE_OVERLAP,
): boolean {
  const tokens = titleTokens(title);
  return existing.some((other) => overlapRatio(tokens, other) >= threshold);
}

/**
 * Quotation marks off a word, and only those.
 *
 * A blanket `replace(/['’"]/g, "")` looked equivalent and was not: it turns
 * "Netflix's" into "Netflixs" and would turn "Anne O'Brien" into "OBrien",
 * which is a name that matches nobody. Headlines quote film titles — ‘The
 * Odyssey’ — so the marks have to go from the *edges* of a word while the
 * apostrophe inside it stays.
 */
const unquote = (word: string): string => word.replace(/^[“”"‘’']+/, "").replace(/[“”"‘’']+$/, "");

/**
 * Every 2-to-4 word run of a headline, as a candidate name.
 *
 * Not "the capitalised runs": a headline in Title Case capitalises everything,
 * so capitalisation carries no information exactly when we need it. So the
 * n-grams go out wide and the *database* decides which of them is a person —
 * a name is only a name if we already have a page for it.
 */
export function nameCandidates(headline: string): string[] {
  const words = headline
    .split(/[\s—–\-,:;!?()\[\]|]+/)
    .map((w) => unquote(w).replace(/[.]+$/, "").trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const run = words.slice(i, i + n);
      // A name does not begin or end on filler, and the run has to look like
      // words rather than a figure: "$1.67 Billion Ten-Day" is not anybody.
      if (STOPWORDS.has(run[0].toLowerCase())) continue;
      if (STOPWORDS.has(run[run.length - 1].toLowerCase())) continue;
      if (run.some((w) => /^[^a-zA-Z가-힣]+$/.test(w))) continue;
      out.add(run.join(" "));
    }
  }
  return [...out];
}

/**
 * A headline turned into the query that finds the *story*, not the article.
 *
 * Handed back to Bing whole, a headline finds the one outlet that wrote it:
 * "The Sound of 'The Odyssey': Composer Ludwig Göransson Used Ancient Greek
 * Instruments" matched seven, but "Marvel's X-Men Movie Cast Explained: Where
 * You've Seen The Actors Before" matched two, and a piece built on two links
 * is a piece with nothing to weigh. So the subtitle goes — everything after a
 * colon or a dash is the outlet's own framing — and what is left is capped at
 * the words that carry the subject.
 *
 * The full headline is not thrown away: it becomes the writer's `--angle`,
 * where a specific phrasing is worth having.
 */
export function storyQuery(headline: string): string {
  const strip = (text: string) => text.split(/\s+/).map(unquote).filter(Boolean);
  const words = strip(headline.split(/\s*[:|—–]\s*/)[0]);
  // Under four words the subtitle was the subject — keep the whole headline.
  const kept = words.length >= 4 ? words : strip(headline.replace(/\s*[:|—–]\s*/g, " "));
  return kept.slice(0, 9).join(" ").replace(/[.,;!?]+$/, "");
}

/**
 * Runs a *film title* could be, which is not the same shape as a name.
 *
 * Two differences, both learned from a run that linked no films at all. A
 * title may begin on an article — "The Odyssey" is the film, and the
 * leading-filler rule that protects names throws it away — and a title may be
 * one word, where a name may not: "Sinners" is a film, and no 2-gram of that
 * headline contains it. Both loosenings are safe only because the match is
 * exact against titles we hold, and the caller puts a popularity floor under
 * the one-word case, where "Sound" and "Choice" are also films somebody made.
 */
export function titleCandidates(headline: string): { grams: string[]; single: string[] } {
  const words = headline
    .split(/[\s—–,:;!?()\[\]|]+/)
    .map((w) => unquote(w).replace(/[.]+$/, "").trim())
    .filter(Boolean);
  const grams = new Set<string>();
  const single = new Set<string>();
  const LEADING = new Set(["the", "a", "an"]);
  for (let i = 0; i < words.length; i++) {
    if (/^[^a-zA-Z가-힣]+$/.test(words[i])) continue;
    // One word is a candidate only if it could carry a title on its own.
    if (!STOPWORDS.has(words[i].toLowerCase()) && words[i].length >= 4) single.add(words[i]);
    for (let n = 2; n <= 5 && i + n <= words.length; n++) {
      const run = words.slice(i, i + n);
      const first = run[0].toLowerCase();
      if (STOPWORDS.has(first) && !LEADING.has(first)) continue;
      if (STOPWORDS.has(run[run.length - 1].toLowerCase())) continue;
      if (run.some((w) => /^[^a-zA-Z가-힣]+$/.test(w))) continue;
      grams.add(run.join(" "));
    }
  }
  return { grams: [...grams], single: [...single] };
}

/** Does the piece actually name this subject? A face on a story that never mentions it is a lie. */
export function namedInProse(name: string, content: string): boolean {
  const haystack = content.toLowerCase();
  if (haystack.includes(name.toLowerCase())) return true;
  // A surname alone is how prose refers to someone after the first mention,
  // and how a Korean name survives a different romanisation of the given name.
  const parts = name.toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
  const surname = parts[parts.length - 1];
  return Boolean(surname) && haystack.includes(surname);
}

export interface Candidate {
  /** The headline, which is also the query the gather runs. */
  topic: string;
  category: "PEOPLE" | "ISSUE" | "INDUSTRY" | "CRAFT";
  /** Newest first, one per outlet. */
  urls: string[];
  date: string;
}

/**
 * Six stories, spread across the shelves rather than taken off the top.
 *
 * Round-robin by category because the buckets do not surface evenly: "box
 * office" returns a dozen live stories on a Friday and "cinematographer"
 * returns two, and taking the freshest six would publish six box-office pieces
 * and call it a day's coverage.
 */
export function pickSpread(candidates: Candidate[], count: number): Candidate[] {
  const byCategory = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  for (const list of byCategory.values()) list.sort((a, b) => b.date.localeCompare(a.date));

  const out: Candidate[] = [];
  const queues = [...byCategory.values()];
  for (let round = 0; out.length < count; round++) {
    let took = false;
    for (const queue of queues) {
      const next = queue[round];
      if (!next) continue;
      out.push(next);
      took = true;
      if (out.length >= count) break;
    }
    if (!took) break;
  }
  return out;
}
