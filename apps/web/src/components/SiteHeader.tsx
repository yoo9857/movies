import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { HeaderChrome } from "./HeaderChrome";
import { UserMenu } from "./UserMenu";

const NAV = [
  { href: "/reviews", label: "Reviews" },
  { href: "/movies", label: "Movies" },
  { href: "/critics", label: "Critics" },
  { href: "/stats", label: "Stats" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <HeaderChrome>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
            Cine<span className="text-accent">Pixo</span>
          </Link>
          {/* On phones these move to the second row so nothing gets squeezed */}
          <nav className="hidden items-center gap-5 text-sm text-muted sm:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-foreground transition-colors">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <form action="/search" method="get" className="hidden md:block">
            <input
              name="q"
              maxLength={100}
              placeholder="Search…"
              aria-label="Search"
              className="w-44 rounded-lg border border-line bg-background/60 px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent"
            />
          </form>
          <Link
            href="/search"
            aria-label="Search"
            className="grid h-8 w-8 place-items-center rounded-lg border border-line/60 text-muted transition-colors hover:border-accent-dim hover:text-foreground md:hidden"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 4 4" strokeLinecap="round" />
            </svg>
          </Link>

          {user ? (
            <UserMenu
              username={user.username}
              displayName={user.displayName}
              isAdmin={user.role === "ADMIN"}
            />
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-sm text-muted transition-colors hover:text-foreground min-[400px]:inline"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
              >
                Join
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Phone nav row — scrolls sideways if the labels ever outgrow the width */}
      <nav className="flex gap-5 overflow-x-auto border-t border-line/60 px-4 py-2 text-sm text-muted sm:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 hover:text-foreground">
            {n.label}
          </Link>
        ))}
      </nav>
    </HeaderChrome>
  );
}
