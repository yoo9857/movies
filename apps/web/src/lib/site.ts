// Identity constants. Everything that names, describes or locates the site
// lives here so metadata, structured data, feeds and the LLM surfaces can never
// drift apart.

/// Canonical origin, no trailing slash — set NEXT_PUBLIC_SITE_URL in production.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

export const SITE_NAME = "CinePixo";
export const SITE_TAGLINE = "Film Critic Fandom";
export const SITE_DESCRIPTION =
  "CinePixo is a fandom home for lovers of film criticism — reviews, ratings, and tributes to the critics who taught us how to watch movies.";

/// A second, longer statement of what the site is. Used where a crawler or an
/// answer engine has room for more than a meta description: llms.txt, the
/// Organization node, feed channel descriptions.
export const SITE_ABOUT =
  "CinePixo is an independent, English-language community for people who love film criticism. Members publish long-form reviews of individual films, score them from 0 to 10 in half-point steps (displayed as a 5-star scale), and the site aggregates those scores into a fandom rating shown next to TMDB's public score so the two can be compared. Alongside the reviews, CinePixo maintains a film library with full credits and a directory of the professional critics the community follows.";

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
  "movie reviews",
  "film critics",
  "star ratings",
  "film fandom",
  "movie ratings",
  "long-form film writing",
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
