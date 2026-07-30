import type { MetadataRoute } from "next";
import { absUrl } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

/**
 * Paths that must never be crawled: authenticated areas, the write flow, and the
 * JSON API. `/search` is intentionally absent — it is crawlable but carries
 * `noindex, follow`, which lets a crawler discover the reviews it links to while
 * keeping an unbounded set of query-string URLs out of the index. A `Disallow`
 * there would block the crawl and the `noindex` along with it.
 */
// `/legacy/` is the 308 machinery for pre-slug movie URLs — the redirects it
// issues are followed from the old URLs themselves; the prefix has no content.
const PRIVATE = ["/admin", "/api/", "/me", "/write", "/login", "/register", "/legacy/"];

/**
 * The Markdown renditions live at /md/ and are rewritten to /reviews/*.md and
 * /movies/*.md. Both forms are documents meant to be read, so both are allowed
 * explicitly — /md/ sits outside /api/ precisely so this stays a one-liner.
 */
const ALLOW = ["/", "/md/", "/llms.txt", "/llms-full.txt", "/feed.xml", "/feed.json"];

/**
 * Assistant and answer-engine crawlers, named and allowed.
 *
 * This is a policy decision, not a formality. Two groups get conflated: training
 * crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended, Applebot-Extended) and
 * retrieval crawlers that fetch a page to answer a live question and cite it
 * (OAI-SearchBot, ChatGPT-User, Claude-User, PerplexityBot, DuckAssistBot).
 * Blocking the second group removes the site from answers entirely — which for a
 * publication whose purpose is to be read and quoted is self-defeating.
 *
 * Both groups are allowed here. A site that wanted its writing kept out of model
 * training while staying citable would move the training names to a
 * `disallow: "/"` rule; that is a one-line change, deliberately left visible.
 */
const ASSISTANT_AGENTS = [
  // OpenAI
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  // Google
  "Googlebot",
  "Googlebot-Image",
  "Googlebot-News",
  "Google-Extended",
  // Microsoft / Bing
  "Bingbot",
  "BingPreview",
  // Apple
  "Applebot",
  "Applebot-Extended",
  // Others that cite
  "PerplexityBot",
  "Perplexity-User",
  "DuckAssistBot",
  "DuckDuckBot",
  "YouBot",
  "Amazonbot",
  "meta-externalagent",
  "meta-externalfetcher",
  "CCBot",
  "cohere-ai",
  "MistralAI-User",
  // Social unfurlers: these read OG tags, so blocking them breaks link previews
  "Twitterbot",
  "facebookexternalhit",
  "LinkedInBot",
  "Slackbot",
  "Discordbot",
  "TelegramBot",
  "WhatsApp",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ALLOW,
        disallow: PRIVATE,
      },
      {
        // Named explicitly so the policy is auditable in the served file rather
        // than inferred from the wildcard rule.
        userAgent: ASSISTANT_AGENTS,
        allow: ALLOW,
        disallow: PRIVATE,
      },
    ],
    sitemap: absUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
