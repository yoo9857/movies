import { headers } from "next/headers";
import { ADSENSE_CLIENT } from "@/lib/site";

/**
 * The AdSense loader, mounted once in the site layout.
 *
 * **A plain `<script>`, not `next/script`, and that is the whole point.**
 *
 * This used to be `<Script strategy="afterInteractive">`, which reads like the
 * careful choice and is the wrong one here. `afterInteractive` does not put a
 * tag in the document — it puts *instructions* in the document. What the server
 * actually sent was a `<link rel="preload">` hint and a JSON blob for the Next
 * runtime to act on after hydration:
 *
 *     {"strategy":"afterInteractive","src":"https://pagead2.googlesyndication.com/…"}
 *
 * The `<script>` element was then created by JavaScript in the browser. Ads
 * worked. But `grep '<script[^>]*adsbygoogle'` over the served HTML returned
 * nothing, and anything that reads the page without executing JavaScript — which
 * is how "paste this into your <head>" is verified — found no AdSense code on a
 * site whose whole business is being reviewed for it. Verified live on
 * 2026-08-20 while an application sat in review.
 *
 * A bare `<script async src>` rendered from a Server Component is hoisted into
 * `<head>` by React and arrives *in the HTML*, which is what the instructions
 * ask for and what a verifier can see.
 *
 * `async` is what protects the LCP, and it always was. The old comment credited
 * `afterInteractive` for keeping the tag out of the critical path, but an async
 * script never blocked rendering; deferring it past hydration bought a little
 * more and cost the tag's visibility, which was not a trade worth making.
 *
 * Renders nothing at all without a publisher id. It reads the same
 * `ADSENSE_ACCOUNT` that already drives /ads.txt and the account meta tag —
 * one id for the whole feature, so there is no way to ship a site whose
 * ads.txt authorises one publisher and whose script loads another.
 *
 * This tag is the root of the ad stack's trust: under `'strict-dynamic'`
 * (lib/csp.ts) everything Google loads afterwards — the ad server, the
 * creatives, the consent message — is allowed because *this* script was
 * nonced, and nothing else on the page can obtain that. Ship it without the
 * nonce and the whole stack silently fails to load, which is precisely the
 * failure the old host allowlist was written to avoid and did not.
 */
export async function AdSenseScript() {
  if (!ADSENSE_CLIENT) return null;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      async
      nonce={nonce}
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`}
    />
  );
}
