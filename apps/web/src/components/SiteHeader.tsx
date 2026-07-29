import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "./UserMenu";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Cine<span className="text-accent">Pixo</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-muted sm:flex">
            <Link href="/reviews" className="hover:text-foreground transition-colors">
              Reviews
            </Link>
            <Link href="/movies" className="hover:text-foreground transition-colors">
              Movies
            </Link>
            <Link href="/critics" className="hover:text-foreground transition-colors">
              Critics
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <form action="/search" method="get" className="hidden md:block">
            <input
              name="q"
              maxLength={100}
              placeholder="Search…"
              aria-label="Search"
              className="w-44 rounded-lg border border-line bg-background px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent"
            />
          </form>
          <Link
            href="/search"
            aria-label="Search"
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-accent-dim hover:text-foreground md:hidden"
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
                className="text-sm text-muted transition-colors hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
              >
                Join
              </Link>
            </>
          )}
        </div>
      </div>

      <nav className="flex items-center gap-5 border-t border-line px-4 py-2 text-sm text-muted sm:hidden">
        <Link href="/reviews" className="hover:text-foreground">
          Reviews
        </Link>
        <Link href="/movies" className="hover:text-foreground">
          Movies
        </Link>
        <Link href="/critics" className="hover:text-foreground">
          Critics
        </Link>
      </nav>
    </header>
  );
}
