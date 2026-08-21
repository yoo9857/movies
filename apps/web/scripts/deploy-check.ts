// The public surfaces, checked against a running site.
//
//   cd apps/web && npx tsx scripts/deploy-check.ts
//   npx tsx scripts/deploy-check.ts --url=https://cinepixo.com
//   npm run deploy-check -- --url=http://127.0.0.1:3400
//
// A health endpoint proves the app is up. It does not prove the app is *right*
// — and the things that go quietly wrong here are all of that second kind:
//
//   · **ads.txt can vanish at build time.** The publisher id arrives through a
//     `NEXT_PUBLIC_` variable, which Next inlines when it builds. A build that
//     ran without `.env.local` bakes an empty value, and from then on ads.txt
//     answers 404 and the ad code renders nothing — with no error anywhere,
//     until AdSense says it cannot find the file and the review stalls.
//   · **The ad unit can vanish the same way.** One variable to the left of the
//     one above: `NEXT_PUBLIC_ADSENSE_SLOT_RAIL` is what `AdSlot` renders, and
//     it renders nothing without it. A build missing that ships a site with a
//     correct ads.txt, a correct account tag, a loading script and no inventory.
//   · **A thin browse state can quietly become indexable.** The film and person
//     listings enumerate a six-figure import; only the states the sitemap
//     announces may be offered as destinations. Losing that rule puts tens of
//     thousands of pages of database into the index, which is how a site is read
//     as a scraped directory and what an ad network rejects it for.
//   · A feed that 500s is invisible until a subscriber complains.
//   · A sitemap that lost a section takes weeks to show up as lost traffic.
//
// So this asks the questions a person would ask if they thought to, and it is
// cheap enough to run after every deploy. Exit code 1 if anything failed.
import { streamedRenderProblem } from "../src/lib/deploy-health";

const ARG = (process.argv.find((a) => a.startsWith("--url=")) ?? "").split("=").slice(1).join("=");
const BASE = (ARG || process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3400").replace(/\/+$/, "");
const PEOPLE_SAMPLE = Number(
  (process.argv.find((a) => a.startsWith("--people-sample=")) ?? "--people-sample=40")
    .split("=")
    .at(-1),
);

interface Check {
  /** Fixed path, or the label to print when `resolve` finds the real one. */
  path: string;
  /**
   * Find the path at run time. The article surfaces have no fixed URL — the
   * newest post's slug is whatever was published last — so the check has to go
   * and look. Returning a string means "check this instead of `path`".
   */
  resolve?: () => Promise<string | null>;
  /** What it must contain, or a predicate for the awkward ones. */
  expect?: (body: string, res: Response) => string | null;
  /** A 404 here is a finding, not a failure — some surfaces are optional. */
  optional?: boolean;
  /** Repeat database-backed pages to catch intermittent 5xx responses. */
  attempts?: number;
}

const contains = (...needles: string[]) => (body: string) => {
  const missing = needles.filter((n) => !body.includes(n));
  return missing.length === 0 ? null : `missing ${missing.map((m) => `"${m}"`).join(", ")}`;
};

/** The newest published post, as a site-relative path. */
async function newestPost(): Promise<string | null> {
  const res = await fetch(`${BASE}/sitemaps/blog.xml`, {
    headers: { "User-Agent": "CinePixo-deploy-check/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  // Shelves live under /blog/category/; a piece is flat at /blog/<slug>.
  const post = locs.find((u) => /\/blog\/[^/]+$/.test(u) && !u.endsWith("/feed.xml"));
  return post ? new URL(post).pathname : null;
}

/**
 * An article carries a real ad unit.
 *
 * The loader script on `/` proves the *account* reached the page. It does not
 * prove a single ad can ever serve, because the unit is a separate variable:
 * `AdSlot` is handed `NEXT_PUBLIC_ADSENSE_SLOT_RAIL` and renders `null` when it
 * is empty. `NEXT_PUBLIC_*` is inlined at build time, so a build that ran
 * without `.env.local` ships articles with no `<ins>` in them at all — every
 * page 200s, ads.txt is correct, the account tag is present, and the inventory
 * is zero. That is the exact shape of the ads.txt failure this script was
 * written for, one variable to the left, and it is invisible from outside.
 */
const adUnitOnArticle = (body: string): string | null => {
  if (!body.includes('class="adsbygoogle')) {
    return "no ad unit in the article — NEXT_PUBLIC_ADSENSE_SLOT_RAIL was empty when this build ran";
  }
  const slot = /data-ad-slot="([^"]*)"/.exec(body)?.[1] ?? "";
  return slot.trim() ? null : "ad unit present but data-ad-slot is empty";
};

/**
 * Read the rendered robots directive.
 *
 * The tag, not the raw body: Next serialises the RSC flight payload into the
 * same document, so every string on the page appears twice and a bare
 * `body.includes("noindex")` matches the word wherever it happens to occur.
 */
const robotsMeta = (body: string): string | null =>
  /<meta name="robots" content="([^"]*)"/.exec(body)?.[1] ?? null;

/**
 * The ad stack, as a machine that does not run JavaScript sees it.
 *
 * Both halves have to be *elements in the HTML*, and the old check did not say
 * so: it looked for the substring "adsbygoogle.js", which a
 * `<link rel="preload">` hint and a serialised Next runtime instruction both
 * satisfy. That is exactly what the site was shipping — `next/script` with
 * `afterInteractive` had the browser create the tag after hydration, so the
 * served HTML contained the URL twice and a `<script>` tag zero times, and this
 * check stayed green through an AdSense review that could not find the code.
 *
 * So: match the tag. The account meta is what verifies ownership; the loader is
 * what the instructions tell publishers to paste into `<head>`.
 */
const adStackInHtml = (body: string): string | null => {
  const missing: string[] = [];
  if (!/<meta name="google-adsense-account" content="ca-pub-[0-9]+"/.test(body)) {
    missing.push("the google-adsense-account meta tag");
  }
  // A real element, not a preload hint and not a JSON blob naming the URL.
  if (!/<script[^>]*\bsrc="[^"]*adsbygoogle\.js[^"]*"/.test(body)) {
    missing.push(
      "a literal <script src=…adsbygoogle.js> in the HTML" +
        (body.includes("adsbygoogle.js")
          ? ' (the URL is present, but only as a preload hint or a client-side instruction — this is the next/script "afterInteractive" trap)'
          : ""),
    );
  }
  return missing.length === 0 ? null : `missing ${missing.join("; ")}`;
};

/**
 * The Markdown rendition is advertised, and advertised at a URL that exists.
 *
 * Both halves matter and only the second is interesting. The `<link>` tag comes
 * from `pageMetadata`, which builds it from `SITE_URL`; the HTTP header comes
 * from `proxy.ts`, which on its first deploy built it from
 * `request.nextUrl.origin` — and behind nginx that is `https://localhost:3400`.
 * The header was present, well-formed, and pointed somewhere no client on earth
 * could fetch. Nothing in a unit test sees that, because the function under test
 * returns a path and the path was right.
 */
const markdownAlternate = (body: string, res: Response): string | null => {
  const problems: string[] = [];
  const responseOrigin = new URL(res.url).origin;
  if (!/<link[^>]*type="text\/markdown"[^>]*>/.test(body)) {
    problems.push('no <link rel="alternate" type="text/markdown"> in the HTML');
  }
  const header = (res.headers.get("link") ?? "")
    .split(",")
    .map((p) => p.trim())
    .find((p) => p.includes('rel="alternate"') && p.includes("markdown"));
  if (!header) {
    problems.push("no Link: rel=alternate header (a HEAD request learns nothing)");
  } else if (!header.includes(`<${responseOrigin}/`)) {
    problems.push(`Link header points off-origin: ${header} (expected ${responseOrigin}/…)`);
  }
  return problems.length === 0 ? null : problems.join("; ");
};

const indexable = (body: string): string | null => {
  const robots = robotsMeta(body);
  if (robots == null) return "no robots meta tag";
  return /noindex/.test(robots) ? `robots says "${robots}", but the sitemap submits this URL` : null;
};

const notIndexable = (body: string): string | null => {
  const robots = robotsMeta(body);
  if (robots == null) return "no robots meta tag — a thin browse state must say noindex";
  if (!/noindex/.test(robots)) return `robots says "${robots}" — a thin browse state must be noindex`;
  // `follow` is load-bearing: pagination is how a crawler reaches the films, and
  // the films are how it reaches the reviews.
  return /nofollow/.test(robots) ? `robots says "${robots}" — must stay "follow"` : null;
};

const CHECKS: Check[] = [
  {
    path: "/ads.txt",
    // The shape AdSense parses: seller domain, publisher id, relationship, and
    // Google's certification authority id.
    expect: contains("google.com,", "pub-", "DIRECT", "f08c47fec0942fa0"),
  },
  {
    path: "/",
    // Both halves of the ad stack, as elements in the HTML rather than as
    // strings that happen to appear in it.
    expect: adStackInHtml,
  },
  { path: "/robots.txt", expect: contains("Sitemap:", "Disallow: /admin") },
  { path: "/sitemap.xml", expect: contains("<sitemapindex", "/sitemaps/blog") },
  { path: "/sitemaps/blog.xml", expect: contains("<urlset", "/blog/") },
  { path: "/sitemaps/people.xml", expect: contains("<urlset", "/people/") },
  { path: "/feed.xml", expect: contains("<rss", "rel=\"self\"") },
  { path: "/feed.json", expect: contains("\"version\"", "jsonfeed") },
  { path: "/blog/feed.xml", expect: contains("<rss", "Off Camera") },
  { path: "/llms.txt", expect: contains("# CinePixo", "/blog") },
  { path: "/blog", expect: contains("Off Camera") },
  // The machine-readable half of the site: a rendition exists, and it is
  // advertised twice, at a URL a client can actually reach.
  {
    path: "the newest post's markdown rendition",
    resolve: newestPost,
    expect: markdownAlternate,
  },
  { path: "/critics/jonathan-rosenbaum", expect: markdownAlternate },
  { path: "/critics/jonathan-rosenbaum.md", expect: contains("type: 'critic-profile'", "not a byline") },
  // The inventory itself, on the page it is supposed to pay for.
  //
  // `optional` only because the slot id cannot exist before AdSense approves the
  // account: until then there is legitimately nothing to place, and a check that
  // exits 1 after every deploy for a reason nobody can act on is a check people
  // learn to scroll past. It still prints the reason every run. **Drop
  // `optional` the day NEXT_PUBLIC_ADSENSE_SLOT_RAIL is set** — from then on its
  // absence means a build lost it, which is exactly the silent failure the rest
  // of this script exists for.
  {
    path: "the newest post's ad unit",
    resolve: newestPost,
    expect: adUnitOnArticle,
    optional: true,
  },
  // The two halves of the thin-listing rule, checked against the built site
  // rather than the source. A browse state is a destination only where the
  // sitemap says so; the pages that merely enumerate an imported library are
  // walkable and not indexable. Both directions matter — a regression that
  // marks *everything* noindex would silently delist the library's entry points.
  { path: "/movies", expect: indexable },
  { path: "/movies?genre=Drama", expect: indexable },
  { path: "/movies?page=2", expect: notIndexable },
  { path: "/movies?genre=Drama&decade=1990", expect: notIndexable },
  { path: "/people", expect: indexable },
  { path: "/people?letter=A", expect: notIndexable },
  { path: "/about", expect: contains("About CinePixo") },
  { path: "/contact", expect: contains("Contact") },
  { path: "/privacy", expect: contains("Privacy Policy") },
  { path: "/terms", expect: contains("Terms of Use") },
  { path: "/editorial", expect: contains("Editorial standards", "First-hand") },
  { path: "/writers", expect: contains("Writers") },
  // These are representative URLs from the 153-person-page Search Console
  // 5xx incident. Two successful renders each make a transient database or
  // server-rendering regression visible immediately after deployment.
  { path: "/people/robert-brown-2", attempts: 2 },
  { path: "/people/samantha-smith", attempts: 2 },
  { path: "/people/ger-duany", attempts: 2 },
  { path: "/people/leslie-belzberg", attempts: 2 },
  { path: "/people/peter-nelson", attempts: 2 },
  // Only present once a key is configured; its absence is worth saying but is
  // not a broken deploy.
  { path: "/indexnow-key.txt", optional: true },
];

async function run(check: Check): Promise<string | null> {
  let path = check.path;
  if (check.resolve) {
    let resolved: string | null;
    try {
      resolved = await check.resolve();
    } catch {
      return "could not work out which URL to check";
    }
    if (!resolved) return "no such page exists yet";
    path = resolved;
  }

  const url = `${BASE}${path}`;
  const attempts = check.attempts ?? 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": "CinePixo-deploy-check/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return `could not be reached${attempts > 1 ? ` on attempt ${attempt}` : ""}`;
    }
    if (res.status === 404 && check.optional) return "not configured";
    if (!res.ok) return `answered ${res.status}${attempts > 1 ? ` on attempt ${attempt}` : ""}`;
    const body = await res.text();
    if (!body.trim()) return `answered empty${attempts > 1 ? ` on attempt ${attempt}` : ""}`;
    const problem = streamedRenderProblem(body) ?? check.expect?.(body, res) ?? null;
    if (problem) return `${problem}${attempts > 1 ? ` on attempt ${attempt}` : ""}`;
  }
  return null;
}

async function checkPeopleSample(): Promise<{ checked: number; failures: string[] }> {
  if (!Number.isInteger(PEOPLE_SAMPLE) || PEOPLE_SAMPLE < 1 || PEOPLE_SAMPLE > 500) {
    throw new Error("--people-sample must be an integer from 1 to 500");
  }
  const sitemap = await fetch(`${BASE}/sitemaps/people.xml`, {
    headers: { "User-Agent": "CinePixo-deploy-check/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!sitemap.ok) return { checked: 0, failures: [`people sitemap answered ${sitemap.status}`] };
  const xml = await sitemap.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .filter((url) => new URL(url).pathname.startsWith("/people/"));
  if (urls.length === 0) return { checked: 0, failures: ["people sitemap has no person URLs"] };
  if (urls.length > 50_000) {
    return { checked: 0, failures: [`people sitemap exceeds the 50,000 URL limit (${urls.length})`] };
  }

  const count = Math.min(PEOPLE_SAMPLE, urls.length);
  const sampled = Array.from(
    new Set(
      Array.from({ length: count }, (_, index) =>
        urls[Math.round((index * (urls.length - 1)) / Math.max(1, count - 1))],
      ),
    ),
  );
  const failures: string[] = [];
  for (let start = 0; start < sampled.length; start += 5) {
    const batch = sampled.slice(start, start + 5);
    const results = await Promise.all(
      batch.map(async (url) => {
        const path = new URL(url).pathname;
        return { path, problem: await run({ path, attempts: 2 }) };
      }),
    );
    for (const result of results) {
      if (result.problem) failures.push(`${result.path}: ${result.problem}`);
    }
  }
  return { checked: sampled.length, failures };
}

async function main() {
  console.log(`Checking ${BASE}\n`);
  const results = await Promise.all(
    CHECKS.map(async (c) => ({ check: c, problem: await run(c) })),
  );
  const people = await checkPeopleSample();

  let failed = 0;
  for (const { check, problem } of results) {
    if (!problem) {
      console.log(`  ok    ${check.path}`);
    } else if (check.optional) {
      console.log(`  --    ${check.path}  (${problem})`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${check.path}  ${problem}`);
    }
  }
  const surfaceFailed = failed;

  if (people.failures.length === 0) {
    console.log(`  ok    people sitemap sample (${people.checked} pages)`);
  } else {
    failed += people.failures.length;
    for (const problem of people.failures) console.log(`  FAIL  ${problem}`);
  }

  console.log(`\n${results.length - surfaceFailed}/${results.length} fixed surfaces good; ${people.checked} person pages sampled`);
  if (failed > 0) {
    console.log(
      "\nIf ads.txt or the ad code is the failure, the likely cause is a build that ran\n" +
        "without apps/web/.env.local. Both NEXT_PUBLIC_GOOGLE_ADSENSE_ACCOUNT (the\n" +
        "publisher id, behind ads.txt and the account tag) and NEXT_PUBLIC_ADSENSE_SLOT_RAIL\n" +
        "(the ad unit itself) are inlined at build time, so an empty one is baked in until\n" +
        "the next build — and neither failure raises an error anywhere.",
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
