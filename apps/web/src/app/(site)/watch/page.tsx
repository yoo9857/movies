import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { Poster } from "@/components/Poster";
import { ReelDivider, SectionHead } from "@/components/ReelDivider";
import {
  breadcrumbNode,
  type Crumb,
  graph,
  itemListNode,
  movieEntityId,
  pageMetadata,
  webPageNode,
} from "@/lib/seo";

/**
 * The shelf of things you can actually play here.
 *
 * Every other listing on this site is an index of writing *about* films. This
 * one is the small, strange corner where the film itself — or the trailer a
 * studio let fall out of copyright in 1959 — sits on our own storage and plays
 * in our own element. It exists because that material is genuinely free, and
 * because nothing else on the site would ever surface it: these are mostly
 * films no one has reviewed yet, so they never reach a rail.
 *
 * Two shelves, and the order is deliberate. A complete film is a different
 * offer from a two-minute trailer and must not be sold as the same thing.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    path: "/watch",
    title: "Free to Watch",
    description:
      "Public-domain films and theatrical trailers, hosted on our own storage and playable here — each with the licence it arrived under and a link to its source.",
    keywords: [
      "public domain films",
      "free films online",
      "classic movie trailers",
      "silent film archive",
    ],
  });
}

const trail: Crumb[] = [
  { name: "Home", path: "/" },
  { name: "Free to Watch", path: "/watch" },
];

/** 3922 → "1:05:22", 140 → "2:20". */
function runtime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

interface Card {
  slug: string;
  title: string;
  releaseDate: Date | null;
  image: string | null;
  posterPath: string | null;
  seconds: number | null;
  license: string | null;
}

function WatchCard({ film, kind }: { film: Card; kind: "film" | "trailer" }) {
  const year = film.releaseDate?.getUTCFullYear();
  return (
    <Link
      href={`/movies/${film.slug}`}
      className="group flex flex-col rounded-xl border border-line bg-surface p-3 transition-colors hover:border-accent-dim"
    >
      <span className="relative block overflow-hidden rounded-lg">
        <Poster
          path={film.posterPath}
          image={film.image}
          title={film.title}
          year={year}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
        />
        <span className="absolute bottom-2 left-2 grid h-9 w-9 place-items-center rounded-full bg-accent/90 text-black opacity-90 transition-transform group-hover:scale-110">
          <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
      <span className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-accent">
        {film.title}
      </span>
      <span className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted">
        {year && <span>{year}</span>}
        {film.seconds && <span>{runtime(film.seconds)}</span>}
      </span>
      <span className="mt-0.5 line-clamp-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
        {kind === "film" ? "Complete film" : "Trailer"}
        {film.license ? ` · ${film.license}` : ""}
      </span>
    </Link>
  );
}

export default async function WatchPage() {
  const select = {
    slug: true,
    title: true,
    releaseDate: true,
    image: true,
    posterPath: true,
  } as const;

  const [films, trailers] = await Promise.all([
    prisma.movie.findMany({
      where: { filmFile: { not: null } },
      orderBy: [{ wikidataSitelinks: "desc" }, { releaseDate: "desc" }],
      take: 120,
      select: { ...select, filmFileDuration: true, filmFileLicense: true },
    }),
    prisma.movie.findMany({
      // A film already on the top shelf is not repeated on the bottom one.
      where: { trailerFile: { not: null }, filmFile: null },
      orderBy: [{ wikidataSitelinks: "desc" }, { releaseDate: "desc" }],
      take: 240,
      select: { ...select, trailerFileDuration: true, trailerFileLicense: true },
    }),
  ]);

  const filmCards: Card[] = films.map((f) => ({
    ...f,
    seconds: f.filmFileDuration,
    license: f.filmFileLicense,
  }));
  const trailerCards: Card[] = trailers.map((f) => ({
    ...f,
    seconds: f.trailerFileDuration,
    license: f.trailerFileLicense,
  }));

  // Only what this page renders goes in the graph — the two shelves as one
  // ordered list, pointing at the film pages where the player actually lives.
  const entries = [...filmCards, ...trailerCards].map((f) => ({
    path: `/movies/${f.slug}`,
    name: f.title,
    entityId: movieEntityId(f.slug),
  }));

  const jsonLd = graph(
    webPageNode({
      path: "/watch",
      name: "Free to Watch",
      description:
        "Public-domain films and theatrical trailers hosted on CinePixo's own storage.",
      kind: "CollectionPage",
    }),
    breadcrumbNode("/watch", trail),
    entries.length > 0 &&
      itemListNode({
        path: "/watch",
        name: "Free to watch",
        description: "Films and trailers playable on CinePixo.",
        totalItems: entries.length,
        entries,
      }),
  );

  return (
    <div className="space-y-12">
      <JsonLd data={jsonLd} />

      <header>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Free to Watch</h1>
        <p className="mt-3 max-w-[62ch] text-muted">
          Some cinema is free — a film whose copyright has lapsed, a theatrical trailer
          that went out in 1959 without a notice on it. Where that is true we keep our
          own copy rather than pointing at someone else&rsquo;s, and it plays here, in
          our own player, with the licence it arrived under printed beneath it.
        </p>
      </header>

      {filmCards.length > 0 && (
        <section>
          <SectionHead
            action={<span className="font-mono text-xs text-muted">{filmCards.length}</span>}
          >
            Complete films
          </SectionHead>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {filmCards.map((f) => (
              <WatchCard key={f.slug} film={f} kind="film" />
            ))}
          </div>
        </section>
      )}

      {filmCards.length > 0 && trailerCards.length > 0 && <ReelDivider />}

      {trailerCards.length > 0 && (
        <section>
          <SectionHead
            action={<span className="font-mono text-xs text-muted">{trailerCards.length}</span>}
          >
            Trailers we host
          </SectionHead>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {trailerCards.map((f) => (
              <WatchCard key={f.slug} film={f} kind="trailer" />
            ))}
          </div>
        </section>
      )}

      {entries.length === 0 && (
        <p className="text-muted">Nothing on the shelf yet.</p>
      )}
    </div>
  );
}
