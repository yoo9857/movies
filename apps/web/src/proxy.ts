// Convenience redirect only — NOT a security boundary (CVE-2025-29927).
// Real enforcement lives in src/lib/auth.ts, called inside every protected
// route handler and admin page.
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "cinepixo_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !hasCookie) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if ((pathname.startsWith("/me") || pathname === "/write") && !hasCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/me/:path*", "/write"],
};
