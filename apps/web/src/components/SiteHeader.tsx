import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface/60 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Cine<span className="text-accent">Pixo</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-muted">
          <Link href="/reviews" className="hover:text-foreground transition-colors">
            Reviews
          </Link>
          <Link href="/critics" className="hover:text-foreground transition-colors">
            Critics
          </Link>
        </nav>
      </div>
    </header>
  );
}
