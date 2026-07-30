import { ADSENSE_ACCOUNT } from "@/lib/site";

/**
 * GET /ads.txt — who is authorised to sell this site's ad inventory.
 *
 * AdSense requires it: without this file the account review stalls and
 * "earnings at risk" warnings follow. The IAB format is one line per
 * authorised seller; `DIRECT` says we hold the AdSense account ourselves, and
 * the trailing id is Google's certification authority ID — a constant for
 * every AdSense publisher, not a secret.
 *
 * Derived from the same env var as the meta tag, so the two can never name
 * different accounts. No account configured → 404, because an empty ads.txt
 * reads to buyers as "nobody may sell here", which is a policy statement this
 * env has no business making implicitly.
 */
export function GET(): Response {
  if (!ADSENSE_ACCOUNT) return new Response(null, { status: 404 });

  // "ca-pub-9021429421997169" (the tag form) → "pub-9021429421997169" (ads.txt form).
  const publisher = ADSENSE_ACCOUNT.replace(/^ca-/, "");

  return new Response(`google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
