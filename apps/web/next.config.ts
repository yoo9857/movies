import type { NextConfig } from "next";

// Uploads live either on this origin (local driver) or on an object-storage
// host. The image optimiser has to know which; so does the CSP, which builds
// its own copy of this in src/lib/csp.ts because the proxy cannot import from
// this file.
const uploadHost = (() => {
  const raw = process.env.S3_PUBLIC_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
})();

// The Content-Security-Policy is NOT here. It is minted per request in
// src/proxy.ts, because AdSense only supports a nonce-based policy and a nonce
// must be new on every request — see src/lib/csp.ts. Everything below is a
// header whose value never changes, which is exactly what this hook is for.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS — effective once served over HTTPS in production
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@cinepixo/db", "@cinepixo/shared"],
  poweredByHeader: false, // don't advertise the framework

  // Which user agents get *blocking* metadata instead of streamed metadata.
  //
  // For agents on this list the full <head> — title, canonical, Open Graph,
  // the rel="alternate" markdown links — is present in the initial HTML rather
  // than injected mid-stream. Agents that read HTML once and do not execute
  // scripts otherwise see a page with no metadata at all, which for the AI
  // crawlers robots.txt explicitly welcomes would mean courting them in one
  // file and serving them a bare shell in another.
  //
  // What this does NOT do, verified against Next's own source: change status
  // codes. A missing slug still answers 200 — once the shell has streamed the
  // status is committed, and notFound() past that point renders the 404 UI and
  // injects <meta name="robots" content="noindex"> (framework-designed, and
  // confirmed present in our output). Search engines honour the noindex, so a
  // soft-404 here is unindexable rather than harmful.
  //
  // Setting the option REPLACES Next's default list, so the first line is that
  // default, verbatim (next/dist/shared/lib/router/utils/html-bots.js). The
  // second line adds plain Googlebot — matched by neither default pattern —
  // and the AI agents from robots.txt.
  htmlLimitedBots:
    /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|Googlebot|GoogleOther|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|PerplexityBot|Amazonbot|Bytespider|meta-externalagent|CCBot|cohere-ai|Diffbot|SemrushBot|AhrefsBot|MJ12bot|DotBot/i,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
      ...(uploadHost
        ? [{ protocol: "https" as const, hostname: uploadHost }]
        : []),
    ],
    // AVIF first, WebP behind it. Every source here is already WebP out of the
    // ingest pipeline, so this buys roughly a further 20% on the hero — the one
    // image on a post that is fetched before anything else — and costs a slower
    // first encode per size, which the cache below then holds.
    formats: ["image/avif", "image/webp"],
    // Our objects are immutable: a changed picture is a new key, never a new
    // version of an old one. The default 60s cache made the optimiser re-encode
    // files that cannot change. A month is still far short of the truth.
    minimumCacheTTL: 2_592_000,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Belt and braces for the admin tree. robots.txt disallows /admin and
        // app/admin/layout.tsx sets a noindex meta tag, but a crawler that cannot
        // fetch a page cannot read a tag inside it — so if an admin URL ever
        // leaks, the header is the directive that still applies. It also covers
        // the client-rendered admin login, which cannot export metadata.
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        // The JSON API is not a document. Nothing under it should ever surface in
        // a result, whatever a stray link says.
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async rewrites() {
    return [
      // "Append .md to the URL" is the convention answer engines and doc tooling
      // already try, and it is what the pages advertise via
      // `rel="alternate" type="text/markdown"`. The handlers live at /md/* so they
      // sit outside the /api/ prefix that robots.txt disallows.
      //
      // `:slug` matches lazily up to the literal `.md`, and review slugs and movie
      // ids are both restricted to [a-z0-9-] by their schemas, so there is no
      // ambiguity about where the extension starts.
      { source: "/reviews/:slug.md", destination: "/md/reviews/:slug" },
      { source: "/movies/:slug.md", destination: "/md/movies/:slug" },
      { source: "/people/:slug.md", destination: "/md/people/:slug" },
      { source: "/topics/:slug.md", destination: "/md/topics/:slug" },
      { source: "/blog/:slug.md", destination: "/md/blog/:slug" },
      // Pre-slug movie URLs (/movies/<cuid>) must answer a real HTTP 308, and
      // the page cannot deliver one: Next streams metadata, so by the time a
      // redirect thrown in the page runs, 200 is already on the wire and the
      // "redirect" degrades to a meta tag only browsers honour. A cuid is
      // recognisable by shape (25 chars, no hyphen — every slug carries one),
      // so those requests are rewritten to a route handler that can still set
      // the status line. Slugs never match and reach the page untouched.
      { source: "/movies/:id(c[a-z0-9]{24})", destination: "/legacy/movies/:id" },
    ];
  },
};

export default nextConfig;
