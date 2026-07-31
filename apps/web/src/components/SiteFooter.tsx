import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-10 text-sm text-muted">
        {/* Big enough here for the mark's own type to be legible */}
        <Image
          src="/logo.png"
          alt="CinePixo"
          width={256}
          height={256}
          className="h-20 w-20 object-contain"
        />
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
            Built, filled and argued over by this community — the library, the artwork we
            license and host, the taxonomy and every signed review grow here, together.
          </span>
        </p>
      </div>
    </footer>
  );
}
