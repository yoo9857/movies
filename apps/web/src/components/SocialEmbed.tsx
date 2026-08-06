"use client";

// Click-to-load frame for an X or Instagram post, via each platform's own
// embed endpoint. Same contract as VideoEmbed: nothing third-party touches
// the network until the reader asks, and the CSP names exactly the two embed
// hosts — the post renders from the platform, with its author attached, and
// none of it is copied to our storage.
import { useState } from "react";

export function SocialEmbed({
  src,
  network,
  height,
}: {
  src: string;
  network: "X" | "Instagram";
  height: number;
}) {
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    return (
      <button
        onClick={() => setLoaded(true)}
        aria-label={`Load this ${network} post`}
        className="block w-full max-w-[34.5rem] rounded-xl border border-line bg-surface px-5 py-10 text-center transition-colors hover:border-accent"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          {network}
        </span>
        <span className="mt-2 block text-sm text-foreground">
          View this post — loads from {network.toLowerCase() === "x" ? "x.com" : "instagram.com"}
        </span>
      </button>
    );
  }

  return (
    <iframe
      src={src}
      title={`${network} post`}
      style={{ height }}
      loading="lazy"
      className="w-full max-w-[34.5rem] rounded-xl border border-line bg-white"
    />
  );
}
