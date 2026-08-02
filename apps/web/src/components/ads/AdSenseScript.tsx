import { headers } from "next/headers";
import Script from "next/script";
import { ADSENSE_CLIENT } from "@/lib/site";

/**
 * The AdSense loader, mounted once in the site layout.
 *
 * `afterInteractive` and not `beforeInteractive`: the tag is worth money but it
 * is not worth the LCP. Nothing about the page depends on it, so it loads once
 * the page is usable — which is also what keeps the ad script out of the
 * critical path Lighthouse measures.
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
    <Script
      id="adsense"
      async
      nonce={nonce}
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`}
    />
  );
}
