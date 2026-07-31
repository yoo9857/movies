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
  trailerFile,
  startAt = 8,
}: {
  /** Artwork on our own storage; without one the billboard is the house field. */
  image: string | null;
  trailerKey: string | null;
  /** A trailer file on our own storage — preferred: our player, zero chrome. */
  trailerFile?: string | null;
  startAt?: number;
}) {
  if (trailerFile) {
    return <NativeBillboard image={image} src={trailerFile} startAt={startAt} />;
  }
  return <EmbedBillboard image={image} trailerKey={trailerKey} startAt={startAt} />;
}

/**
 * The IMDb way: our file, our <video>, every pixel ours. No mask choreography
 * because there is no third-party chrome to hide — the only fade is taste.
 */
function NativeBillboard({
  image,
  src,
  startAt,
}: {
  image: string | null;
  src: string;
  startAt: number;
}) {
  const [showVideo, setShowVideo] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (dismissed) return;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (!wide || calm || nav.connection?.saveData) return;
    const t = window.setTimeout(() => setShowVideo(true), 250);
    return () => window.clearTimeout(t);
  }, [dismissed]);

  return (
    <>
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ opacity: playing ? 0 : 0.3 }}
          className={`scale-125 object-cover blur-2xl transition-opacity duration-1000 ${playing ? "" : "cx-kenburns"}`}
        />
      ) : (
        <div className="absolute inset-0 bg-surface" />
      )}

      {showVideo && (
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted={!sound}
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          style={{ opacity: playing ? 0.68 : 0 }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
          onLoadedMetadata={(e) => {
            e.currentTarget.currentTime = startAt;
          }}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onWaiting={() => setPlaying(false)}
        />
      )}

      {showVideo && playing && (
        <div className="absolute bottom-6 right-4 z-[2] flex gap-2 sm:right-8">
          <button
            onClick={() => {
              setSound((s) => {
                if (videoRef.current) videoRef.current.muted = s;
                return !s;
              });
            }}
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
              videoRef.current?.pause();
              setDismissed(true);
              setShowVideo(false);
              setPlaying(false);
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

function EmbedBillboard({
  image,
  trailerKey,
  startAt,
}: {
  image: string | null;
  trailerKey: string | null;
  startAt: number;
}) {
  const [showVideo, setShowVideo] = useState(false);
  const [ready, setReady] = useState(false);
  const [sound, setSound] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  /**
   * The still is the mask; the video is visible only while the player says
   * PLAYING — not once, but continuously.
   *
   * Revealing on load-plus-delay showed whatever the player happened to be:
   * on autoplay-blocking browsers, a paused player with its big centre
   * controls, which no edge crop can reach. And a one-shot reveal had a
   * second hole the owner found by scrolling: browsers pause an off-screen
   * player, so returning to the top met the same paused chrome. So state 1
   * fades the film in, any other state fades the still back over it, and a
   * pause gets one gentle playVideo nudge per few seconds so an off-screen
   * pause resumes by itself when the player is willing.
   */
  const lastNudge = useRef(0);
  useEffect(() => {
    if (!showVideo) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== "https://www.youtube-nocookie.com") return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        const state = data?.info?.playerState;
        if (typeof state !== "number") return;
        setReady(state === 1);
        if (state === 2 && Date.now() - lastNudge.current > 3_000) {
          lastNudge.current = Date.now();
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: "playVideo", args: [] }),
            "https://www.youtube-nocookie.com",
          );
        }
      } catch {
        /* other widgets' messages are not our business */
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [showVideo]);

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

  // Gated on showVideo (false during SSR), so window is safe to touch here.
  const embed =
    showVideo &&
    trailerKey &&
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerKey)}` +
      `?autoplay=1&mute=${sound ? 0 : 1}&controls=0&loop=1&playlist=${encodeURIComponent(trailerKey)}` +
      `&start=${startAt}&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1&fs=0` +
      // The widget API channel the playing-state listener above depends on.
      // Only rendered client-side (showVideo starts false), so window exists.
      `&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;

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
            ref={iframeRef}
            key={sound ? "sound" : "muted"}
            src={embed}
            title=""
            tabIndex={-1}
            allow="autoplay; encrypted-media"
            /* Handshake: tell the widget we are listening, so it starts
               reporting player state — the reveal above waits for PLAYING. */
            onLoad={() =>
              iframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
                "https://www.youtube-nocookie.com",
              )
            }
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
