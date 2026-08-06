import { ADSENSE_ACCOUNT } from "@/lib/site";

/**
 * The Content-Security-Policy, built per request around a nonce.
 *
 * It lived in `next.config.ts` as a static header until ads arrived, listing
 * Google's hosts explicitly. That is the one shape AdSense does not support:
 *
 *   "Because the domains that the AdSense ad code uses change over time, we
 *    only support strict CSP."
 *   — support.google.com/adsense/answer/16283098
 *
 * An allowlist of someone else's infrastructure is a list that goes stale
 * silently. The first thing it would have broken is not even an ad: Google's
 * consent message, which every EEA/UK/Swiss reader must see before a
 * personalised ad may load, is served from a host that was not on the list.
 *
 * So `script-src` carries a nonce and `'strict-dynamic'`. Scripts this server
 * marks are trusted, anything they load inherits that trust, and a `<script>`
 * injected into a review body inherits nothing — which is a stronger policy
 * than the host list it replaces, not a looser one.
 *
 * `'unsafe-inline'` and the scheme source are the pre-`strict-dynamic`
 * fallback: a browser too old to understand `'strict-dynamic'` reads them, and
 * every browser that understands it ignores them. That is the documented way to
 * write one policy for both, not a hedge.
 *
 * `strict-dynamic` governs `script-src` alone. Frames, images and XHR still
 * need naming, so those directives keep an explicit list — a stale entry there
 * costs an ad slot, never the page.
 */

/** Hosts the ad stack needs for everything that is not a script. */
const ADS = {
  // Where the creative renders, plus Google's consent message (the CMP is
  // mandatory for EEA/UK/Swiss traffic and draws itself in an iframe).
  frame: [
    "https://googleads.g.doubleclick.net",
    "https://tpc.googlesyndication.com",
    "https://www.google.com",
    "https://fundingchoicesmessages.google.com",
  ],
  img: [
    "https://pagead2.googlesyndication.com",
    "https://googleads.g.doubleclick.net",
    "https://tpc.googlesyndication.com",
    "https://www.google.com",
    "https://www.google.co.kr",
    "https://fundingchoicesmessages.google.com",
  ],
  connect: [
    "https://pagead2.googlesyndication.com",
    "https://googleads.g.doubleclick.net",
    "https://csi.gstatic.com",
    "https://ep1.adtrafficquality.google",
    "https://ep2.adtrafficquality.google",
    "https://fundingchoicesmessages.google.com",
  ],
} as const;

/** Uploads live either on this origin or on an object-storage host. */
function uploadHost(): string | null {
  const raw = process.env.S3_PUBLIC_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

const join = (...parts: (string | readonly string[] | false | null)[]) =>
  parts.flat().filter(Boolean).join(" ");

export function contentSecurityPolicy({
  nonce,
  isDev = process.env.NODE_ENV === "development",
  adsense = ADSENSE_ACCOUNT,
}: {
  nonce: string;
  isDev?: boolean;
  adsense?: string | undefined;
}): string {
  const ads = Boolean(adsense);
  const host = uploadHost();

  // Dev needs eval for Turbopack's HMR and React's server-stack reconstruction.
  // Production needs it only because the ad code evaluates its own payloads —
  // no publisher id, no eval, which is what keeps a preview build clean.
  const evals = isDev || ads;

  return [
    "default-src 'self'",
    join(
      `script-src 'nonce-${nonce}' 'strict-dynamic'`,
      evals && "'unsafe-eval'",
      // Fallback for browsers without strict-dynamic; ignored by the rest.
      "'unsafe-inline'",
      ads ? "https:" : "'self'",
    ),
    "style-src 'self' 'unsafe-inline'",
    join(
      `img-src 'self' https://i.ytimg.com${host ? ` https://${host}` : ""} data: blob:`,
      ads && ADS.img,
    ),
    // Trailer files live on our own bucket; without an explicit media-src the
    // <video> falls back to default-src and a cross-origin file is refused.
    "media-src 'self' https://pokemon-dive.us-lax-4.linodeobjects.com",
    "font-src 'self'",
    join("connect-src 'self'", ads && ADS.connect),
    // Embeds only, all loaded on click: trailers (privacy-enhanced domain) and
    // the X / Instagram post frames the blog's paste-a-URL syntax renders.
    join(
      "frame-src https://www.youtube-nocookie.com https://platform.twitter.com https://www.instagram.com",
      ads && ADS.frame,
    ),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * The policy for our XML documents that render through our own XSLT.
 *
 * `/sitemap.xml`, `/sitemaps/*.xml` and `/feed.xml` each carry an
 * `xml-stylesheet` instruction so that a person who opens one sees a table
 * instead of a wall of tags. Chromium checks that stylesheet load against
 * `script-src` — an XSLT transform is executable — and a stylesheet referenced by
 * a processing instruction cannot carry a nonce. Under `'strict-dynamic'` the
 * `'self'` in `script-src` is ignored by design, so the transform was refused and
 * the page rendered blank: valid XML, correct stylesheet, nothing on screen.
 *
 * So these paths get a policy with no `'strict-dynamic'` in it, which lets
 * `'self'` mean what it says. Nothing is loosened in exchange: the stylesheet
 * output contains no script, no event handler and no external reference (checked,
 * not assumed), the documents hold only our own URLs and titles, and every other
 * directive is at least as tight as the site policy. `'unsafe-inline'` on
 * `style-src` is for the one `<style>` block the transform writes.
 */
export function xsltDocumentPolicy(): string {
  return [
    "default-src 'self'",
    // No nonce and no strict-dynamic: the XSLT load is what this has to admit.
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * A fresh nonce per request. `btoa` and `crypto` rather than `Buffer`, because
 * this runs in the proxy, where the Node built-ins are not guaranteed.
 */
export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
