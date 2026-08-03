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
import { contentSecurityPolicy, newNonce, xsltDocumentPolicy } from "@/lib/csp";

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
  return response;
}

export const config = {
  // Everything that can carry a document, which now means everything except the
  // build output itself. Prefetches are deliberately *not* excluded: a policy
  // that skips some navigations is a policy with holes in it, and the work is a
  // UUID and a string join.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
