import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Uploads live either on this origin (local driver) or on an object-storage
// host. The CSP and the image optimiser both have to know which.
const uploadHost = (() => {
  const raw = process.env.S3_PUBLIC_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
})();

// Content-Security-Policy — the single strongest XSS mitigation.
// Dev needs unsafe-eval/inline for Turbopack HMR; production stays strict.
const csp = [
  "default-src 'self'",
  isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' https://image.tmdb.org https://i.ytimg.com${uploadHost ? ` https://${uploadHost}` : ""} data: blob:`,
  "font-src 'self'",
  "connect-src 'self'",
  // trailer embeds only — loaded on click, privacy-enhanced domain
  "frame-src https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
      ...(uploadHost
        ? [{ protocol: "https" as const, hostname: uploadHost }]
        : []),
    ],
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
