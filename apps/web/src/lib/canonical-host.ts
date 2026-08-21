/**
 * Resolve the one public host alias we own without trusting arbitrary Host
 * headers. Nginx preserves the incoming Host while Next's request URL can show
 * the loopback upstream, so the header is the reliable signal here.
 */
export function canonicalHostRedirect(
  siteUrl: string,
  requestUrl: string,
  forwardedHost: string | null,
): URL | null {
  const canonical = new URL(siteUrl);
  const host = forwardedHost?.split(",")[0]?.trim().split(":")[0]?.toLowerCase();
  const canonicalHost = canonical.hostname.toLowerCase();
  if (host !== `www.${canonicalHost}`) return null;

  const incoming = new URL(requestUrl);
  return new URL(`${incoming.pathname}${incoming.search}`, canonical);
}
