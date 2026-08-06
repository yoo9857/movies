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
//   · A feed that 500s is invisible until a subscriber complains.
//   · A sitemap that lost a section takes weeks to show up as lost traffic.
//
// So this asks the questions a person would ask if they thought to, and it is
// cheap enough to run after every deploy. Exit code 1 if anything failed.
const ARG = (process.argv.find((a) => a.startsWith("--url=")) ?? "").split("=").slice(1).join("=");
const BASE = (ARG || process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3400").replace(/\/+$/, "");

interface Check {
  path: string;
  /** What it must contain, or a predicate for the awkward ones. */
  expect?: (body: string, res: Response) => string | null;
  /** A 404 here is a finding, not a failure — some surfaces are optional. */
  optional?: boolean;
}

const contains = (...needles: string[]) => (body: string) => {
  const missing = needles.filter((n) => !body.includes(n));
  return missing.length === 0 ? null : `missing ${missing.map((m) => `"${m}"`).join(", ")}`;
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
  // Only present once a key is configured; its absence is worth saying but is
  // not a broken deploy.
  { path: "/indexnow-key.txt", optional: true },
];

async function run(check: Check): Promise<string | null> {
  const url = `${BASE}${check.path}`;
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
        "without apps/web/.env.local: NEXT_PUBLIC_GOOGLE_ADSENSE_ACCOUNT is inlined at\n" +
        "build time, so an empty one is baked in until the next build.",
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
