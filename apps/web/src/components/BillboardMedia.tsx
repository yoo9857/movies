"use client";

// Cinema billboard: the backdrop still is the LCP image, then the film's
// trailer fades in behind the copy — muted, looping, chrome-free.
//
// Deliberate constraints:
//  · desktop only (≥1024px) — never burn mobile data on an ambient video
//  · respects prefers-reduced-motion (still image stays)
//  · nothing loads from YouTube until the delay fires, so first paint and
//    Lighthouse stay clean; CSP allows only youtube-nocookie frames
//  · sound is off until the viewer asks for it (a user gesture reloads the
//    frame unmuted, which is what browsers require anyway)
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export function BillboardMedia({
  image,
  trailerKey,
  startAt = 8,
}: {
  /** Artwork on our own storage; without one the billboard is the house field. */
  image: string | null;
  trailerKey: string | null;
  startAt?: number;
}) {
  const [showVideo, setShowVideo] = useState(false);
  const [ready, setReady] = useState(false);
  const [sound, setSound] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!trailerKey || dismissed) return;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Some browsers expose a data-saver hint; honor it when present.
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (!wide || calm || nav.connection?.saveData) return;

    // Mount almost immediately: the iframe loads invisibly behind the still,
    // so the network time is spent while the viewer is already looking at
    // artwork. The old 1.4s wait *before even starting* to load was the bulk
    // of the "trailer takes forever" complaint.
    timer.current = window.setTimeout(() => setShowVideo(true), 250);
    return () => window.clearTimeout(timer.current);
  }, [trailerKey, dismissed]);

  // Our own artwork only (posters are portrait, so they sit blurred behind the
  // copy rather than pretending to be a backdrop). No third-party stills.
  const still = image ? { src: image, blur: true } : null;

  const embed =
    trailerKey &&
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerKey)}` +
      `?autoplay=1&mute=${sound ? 0 : 1}&controls=0&loop=1&playlist=${encodeURIComponent(trailerKey)}` +
      `&start=${startAt}&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1&fs=0`;

  return (
    <>
      {/* Still frame — always rendered, so the billboard never flashes empty.
          Opacity is inline, not a utility class: two opacity-* classes would
          collide in the cascade and leave the still ghosting under the video. */}
      {still ? (
        <Image
          src={still.src}
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ opacity: ready ? 0 : still.blur ? 0.3 : 0.62 }}
          className={`object-cover transition-opacity duration-1000 ${
            still.blur ? "scale-125 blur-2xl" : ""
          } ${showVideo ? "" : "cx-kenburns"}`}
        />
      ) : (
        <div className="absolute inset-0 bg-surface" />
      )}

      {/* Trailer layer */}
      {showVideo && embed && (
        <div
          aria-hidden="true"
          style={{ opacity: ready ? 0.68 : 0 }}
          className="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-1000"
        >
          <iframe
            key={sound ? "sound" : "muted"}
            src={embed}
            title=""
            tabIndex={-1}
            allow="autoplay; encrypted-media"
            /* Reveal only after the player's start-up overlay (spinner, big
               play glyph, title flash) has had time to clear — revealing on
               load alone showed exactly that chrome for a beat. */
            onLoad={() => window.setTimeout(() => setReady(true), 1500)}
            /* 16:9 cover, scaled well past the frame so the player's own
               chrome — title bar, watch-later, branding, the transient
               play/pause flash at the edges — is cropped out of view. */
            className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full origin-center -translate-x-1/2 -translate-y-1/2 scale-[1.32] border-0"
          />
          {/* Shield: guarantees the cursor never reaches the player, so its
              hover overlay (centre play/pause, skip buttons) never appears. */}
          <div className="absolute inset-0" />
        </div>
      )}

      {/* Ambient-playback controls — small, bottom-right, out of the copy's way */}
      {showVideo && ready && (
        <div className="absolute bottom-6 right-4 z-[2] flex gap-2 sm:right-8">
          <button
            onClick={() => setSound((s) => !s)}
            aria-label={sound ? "Mute trailer" : "Unmute trailer"}
            className="grid h-9 w-9 place-items-center rounded-full border border-line/70 bg-background/60 text-muted backdrop-blur transition-colors hover:border-accent-dim hover:text-foreground"
          >
            {sound ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zm-2.5-8v2a6 6 0 0 1 0 12v2a8 8 0 0 0 0-16z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M3 10v4h4l5 4V6L7 10H3zm16.6 2 2.4-2.4-1.2-1.2L18.4 10.8 16 8.4l-1.2 1.2 2.4 2.4-2.4 2.4 1.2 1.2 2.4-2.4 2.4 2.4 1.2-1.2z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => {
              setDismissed(true);
              setShowVideo(false);
              setReady(false);
              setSound(false);
            }}
            aria-label="Stop trailer"
            className="grid h-9 w-9 place-items-center rounded-full border border-line/70 bg-background/60 text-muted backdrop-blur transition-colors hover:border-accent-dim hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
