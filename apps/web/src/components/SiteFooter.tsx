import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted">
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/reviews" className="hover:text-foreground">Reviews</Link>
          <Link href="/movies" className="hover:text-foreground">Movies</Link>
          <Link href="/critics" className="hover:text-foreground">Critics</Link>
          <Link href="/stats" className="hover:text-foreground">Stats</Link>
          <Link href="/about" className="hover:text-foreground">About</Link>
          <a href="/feed.xml" className="hover:text-foreground">RSS</a>
        </nav>
        <p className="flex flex-wrap items-center gap-x-2">
          <span>
            Cine<span className="text-accent">Pixo</span> — a home for film-critic fandom.
          </span>
          <span>
            This product uses the{" "}
            <a
              href="https://www.themoviedb.org"
              className="underline underline-offset-2 hover:text-foreground"
              rel="noopener noreferrer"
              target="_blank"
            >
              TMDB
            </a>{" "}
            API but is not endorsed or certified by TMDB.
          </span>
        </p>
      </div>
    </footer>
  );
}
