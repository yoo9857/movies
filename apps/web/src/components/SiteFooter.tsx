export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted">
        <p>
          Cine<span className="text-accent">Pixo</span> — a home for film-critic fandom. Movie data
          courtesy of{" "}
          <a
            href="https://www.themoviedb.org"
            className="underline underline-offset-2 hover:text-foreground"
            rel="noopener noreferrer"
            target="_blank"
          >
            TMDB
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
