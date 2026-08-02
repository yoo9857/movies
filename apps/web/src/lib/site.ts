// Identity constants. Everything that names, describes or locates the site
// lives here so metadata, structured data, feeds and the LLM surfaces can never
// drift apart.

const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;

// NEXT_PUBLIC_* is inlined at build time, so a production bundle built without
// this value would ship `localhost` inside every canonical URL, Open Graph tag,
// sitemap entry and JSON-LD @id — telling search engines the site's real home is
// a machine they cannot reach. That failure is invisible in the built output and
// expensive to discover later, so it fails the build instead.
if (process.env.NODE_ENV === "production" && !configuredUrl) {
  throw new Error(
    "NEXT_PUBLIC_SITE_URL is required for a production build — every canonical URL is derived from it. Set it in apps/web/.env.local (e.g. https://cinepixo.com).",
  );
}

/// Canonical origin, no trailing slash.
export const SITE_URL = (configuredUrl ?? "http://localhost:3000").replace(/\/+$/, "");

export const SITE_NAME = "CinePixo";

/// Sits after the site name in the title template and the manifest, so it does
/// double duty as the category a search result is filed under. "Long-form" is the
/// distinction that matters to the readers and writers this is built for.
export const SITE_TAGLINE = "Long-form Film Criticism";
export const SITE_DESCRIPTION =
  "CinePixo is a home for film criticism as a craft — long-form reviews, half-star ratings, and profiles of the critics whose work set the standard.";

/// A second, longer statement of what the site is. Used where a crawler or an
/// answer engine has room for more than a meta description: llms.txt, the
/// Organization node, feed channel descriptions.
export const SITE_ABOUT =
  "CinePixo is an independent, English-language home for film criticism as a craft. Members publish long-form, signed reviews of individual films — argued and structured, not scored in passing — rated from 0 to 10 in half-point steps and shown on a five-star scale. Alongside the writing, CinePixo keeps a film library with full credits (direction, screenplay, cinematography, editing, score and cast) and a directory of the critics whose work set the standard. It is built for people who take film seriously: critics and reviewers, programmers and filmmakers, performers, and readers who stay for the writing after the credits.";

/// BCP 47 for <html lang> and schema.org inLanguage.
export const SITE_LANG = "en";
/// Underscored form Open Graph expects.
export const SITE_LOCALE = "en_US";

export const CONTACT_EMAIL = "devoh@signpost.kr";

/// Year the site started publishing — Organization.foundingDate.
export const SITE_FOUNDED = "2026";

/// Topic terms. Deliberately short and honest: keyword stuffing is a negative
/// signal, but a handful of accurate topics helps answer engines classify us.
export const SITE_KEYWORDS = [
  "film criticism",
  "film critics",
  "long-form film reviews",
  "film analysis",
  "directing and screenwriting",
  "cinematography",
  "performances on screen",
  "film canon",
];

/// Off-site profiles for schema.org sameAs. Add real handles as they exist —
/// an empty list is better than a wrong one, because sameAs is an identity
/// claim that answer engines will follow.
export const SOCIAL_PROFILES: string[] = [];

/// Search Console / Bing verification tokens, when configured.
export const VERIFICATION = {
  google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  bing: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
  yandex: process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION,
} as const;

/// AdSense publisher id (ca-pub-…), when configured. Emits the account meta
/// tag AdSense uses to match the site to the account — public by design, but
/// env-driven so a fork of this code never ships someone else's id.
export const ADSENSE_ACCOUNT = process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_ACCOUNT;

/// The same id as a plain string, for the markup that has to carry it.
/// It lives here rather than beside the loader because the ad *slot* is a
/// client component: importing it from a module that reads `next/headers`
/// drags a server-only API into the browser bundle and the build stops.
export const ADSENSE_CLIENT = ADSENSE_ACCOUNT ?? "";
