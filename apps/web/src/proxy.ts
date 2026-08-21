// Two jobs, neither of them a security boundary for authentication
// (CVE-2025-29927). Real auth enforcement lives in src/lib/auth.ts, called
// inside every protected route handler and admin page; the redirects here only
// spare a logged-out reader a flash of a page they cannot use.
//
// The second job *is* load-bearing: the Content-Security-Policy is minted here,
// because a nonce has to be new on every request and a static header in
// next.config cannot be. Next reads the `Content-Security-Policy` off the
// incoming request and stamps the same nonce onto the framework bundles, so the
// header must be set on the request as well as the response. See lib/csp.ts for
// why the policy is nonce-based rather than a list of hosts.
import { NextResponse, type NextRequest } from "next/server";
import { canonicalHostRedirect } from "@/lib/canonical-host";
import { contentSecurityPolicy, newNonce, xsltDocumentPolicy } from "@/lib/csp";
import { markdownAlternateFor } from "@/lib/markdown-alternate";
import { SITE_URL } from "@/lib/site";

const SESSION_COOKIE = "cinepixo_session";

/**
 * The XML documents that render through our own XSLT, and the stylesheets
 * themselves.
 *
 * These cannot live under the nonce policy: see `xsltDocumentPolicy`. Matched as
 * an explicit list rather than by extension so that adding a styled document is a
 * decision somebody makes on purpose.
 */
const XSLT_DOCUMENT = /^\/(?:sitemap\.xml|sitemaps\/[a-z-]+\.xml|feed\.xml|sitemap\.xsl|feed\.xsl)$/;

export function proxy(request: NextRequest) {
  const canonical = canonicalHostRedirect(
    SITE_URL,
    request.url,
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );
  if (canonical) return NextResponse.redirect(canonical, 308);

  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !hasCookie) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if ((pathname.startsWith("/me") || pathname === "/write") && !hasCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (XSLT_DOCUMENT.test(pathname)) {
    // No nonce is minted: nothing in these responses is server-rendered markup
    // that could carry one, and the framework bundles are not involved.
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", xsltDocumentPolicy());
    return response;
  }

  const nonce = newNonce();
  const csp = contentSecurityPolicy({ nonce });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  // The HTML already advertises the Markdown rendition with
  // `<link rel="alternate" type="text/markdown">`, which any crawler that parses
  // the document will find. The header is for the ones that do not get that far:
  // a client doing HEAD, or reading headers before deciding the body is worth
  // fetching, learns the machine-readable form exists without downloading the
  // human one. It is the same relationship `markdownResponse` already declares in
  // the other direction, with `Link: rel="canonical"` back at the HTML.
  const alternate = markdownAlternateFor(pathname);
  if (alternate) {
    // `SITE_URL`, not `request.nextUrl.origin`. The origin is whatever the server
    // is bound to — behind nginx that is `https://localhost:3400`, which is what
    // this header advertised on the first deploy and is unreachable to everyone.
    // `SITE_URL` is the canonical origin, and it is already what
    // `markdownResponse` uses for the canonical header pointing back this way.
    //
    // `append`, never `set`: Next puts its own font and image preloads in this
    // header, and replacing it would quietly cost every page its preloading.
    response.headers.append(
      "Link",
      `<${SITE_URL}${alternate}>; rel="alternate"; type="text/markdown"`,
    );
  }

  return response;
}

export const config = {
  // Everything that can carry a document, which now means everything except the
  // build output itself. Prefetches are deliberately *not* excluded: a policy
  // that skips some navigations is a policy with holes in it, and the work is a
  // UUID and a string join.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
