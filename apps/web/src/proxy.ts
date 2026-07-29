// Convenience redirect only — NOT a security boundary (CVE-2025-29927).
// Real enforcement lives in src/lib/auth.ts, called inside every protected
// route handler and admin page.
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "cinepixo_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const hasCookie = request.cookies.has(SESSION_COOKIE);
    if (!hasCookie) {
      const login = new URL("/admin/login", request.url);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
