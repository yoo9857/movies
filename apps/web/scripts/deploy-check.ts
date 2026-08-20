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
const ARG = (process.argv.find((a) => a.startsWith("--url=")) ?? "").split("=").slice(1).join("=");
const BASE = (ARG || process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3400").replace(/\/+$/, "");

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
    // Both halves of the ad stack: the account tag AdSense verifies ownership
    // with, and the script that actually loads.
    expect: contains("google-adsense-account", "adsbygoogle.js"),
  },
  { path: "/robots.txt", expect: contains("Sitemap:", "Disallow: /admin") },
  { path: "/sitemap.xml", expect: contains("<sitemapindex", "/sitemaps/blog") },
  { path: "/sitemaps/blog.xml", expect: contains("<urlset", "/blog/") },
  { path: "/feed.xml", expect: contains("<rss", "rel=\"self\"") },
  { path: "/feed.json", expect: contains("\"version\"", "jsonfeed") },
  { path: "/blog/feed.xml", expect: contains("<rss", "Off Camera") },
  { path: "/llms.txt", expect: contains("# CinePixo", "/blog") },
  { path: "/blog", expect: contains("Off Camera") },
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
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "CinePixo-deploy-check/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return "could not be reached";
  }
  if (res.status === 404 && check.optional) return "not configured";
  if (!res.ok) return `answered ${res.status}`;
  const body = await res.text();
  if (!body.trim()) return "answered empty";
  return check.expect?.(body, res) ?? null;
}

async function main() {
  console.log(`Checking ${BASE}\n`);
  const results = await Promise.all(
    CHECKS.map(async (c) => ({ check: c, problem: await run(c) })),
  );

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

  console.log(`\n${results.length - failed}/${results.length} surfaces good`);
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
