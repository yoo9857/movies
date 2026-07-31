"use client";

// The whole film, played from our own storage.
//
// This is not the trailer embed with a bigger box. The trailer is an
// advertisement and loads a rented player; this is the work itself, free to
// show, served from our origin through a plain <video>. So: real controls, no
// autoplay, and `preload="none"` — a hundred-megabyte file must not start
// arriving because someone scrolled past a film page.
//
// The credit line is not decoration. Public domain is a licence and the file
// page is the evidence for it; the database refuses the licence without the
// source precisely so this line can always be rendered.
import { useState } from "react";
import { SectionHead } from "./ReelDivider";

/** 3671 → "1:01:11", 331 → "5:31". */
function runtime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export function FreeFilmPlayer({
  src,
  poster,
  title,
  duration,
  credit,
  license,
  licenseUrl,
  sourceUrl,
  kind = "film",
}: {
  src: string;
  poster: string | null;
  title: string;
  duration: number | null;
  credit: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
  /** P10 hands over the picture or its trailer; the page must not confuse them. */
  kind?: "film" | "trailer";
}) {
  const [started, setStarted] = useState(false);
  const heading = kind === "film" ? "Watch the film" : "Trailer";

  return (
    <section aria-label={heading}>
      <SectionHead
        action={
          duration ? (
            <span className="font-mono text-xs text-muted">{runtime(duration)}</span>
          ) : null
        }
      >
        {heading}
      </SectionHead>

      <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
        {started ? (
          <video
            src={src}
            poster={poster ?? undefined}
            controls
            autoPlay
            playsInline
            preload="none"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            onClick={() => setStarted(true)}
            className="group absolute inset-0"
            aria-label={kind === "film" ? `Play ${title} in full` : `Play the ${title} trailer`}
          >
            {/* The poster is already an optimised image elsewhere on this page;
                as a plain background here it costs nothing extra to fetch. */}
            {poster && (
              <span
                aria-hidden
                className="absolute inset-0 bg-cover bg-center opacity-50 transition-opacity group-hover:opacity-65"
                style={{ backgroundImage: `url(${JSON.stringify(poster)})` }}
              />
            )}
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-black transition-transform group-hover:scale-110">
                <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/85 to-transparent p-4 text-left">
              <span className="line-clamp-1 text-sm font-medium">
                {title} — {kind === "film" ? "complete film" : "trailer"}
              </span>
              {license && (
                <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent">
                  free
                </span>
              )}
            </span>
          </button>
        )}
      </div>

      {sourceUrl && (
        <p className="mt-2 max-w-[65ch] text-xs text-muted">
          {credit ? `${credit}. ` : ""}
          {license ?? "Free licence"}
          {licenseUrl && (
            <>
              {" ("}
              <a
                href={licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:opacity-80"
              >
                terms
              </a>
              {")"}
            </>
          )}
          {" — from "}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:opacity-80"
          >
            Wikimedia Commons
          </a>
          , re-encoded and served from our own storage.
        </p>
      )}
    </section>
  );
}
