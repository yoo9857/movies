import Script from "next/script";
import { ADSENSE_ACCOUNT } from "@/lib/site";

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
 */
export const ADSENSE_CLIENT = ADSENSE_ACCOUNT ?? "";

export function AdSenseScript() {
  if (!ADSENSE_CLIENT) return null;
  return (
    <Script
      id="adsense"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`}
    />
  );
}
