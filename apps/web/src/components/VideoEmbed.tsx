"use client";

// Click-to-load YouTube frame: static thumbnail by default, the iframe
// (privacy-enhanced nocookie domain) only after explicit user action. No
// third-party network activity on page load. The CSP names exactly these two
// hosts — i.ytimg.com for the poster, youtube-nocookie.com for the frame —
// so anything else here would be refused by the browser, not just by review.
import Image from "next/image";
import { useState } from "react";

export function VideoEmbed({ youtubeKey, title }: { youtubeKey: string; title: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeKey)}?autoplay=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          onClick={() => setPlaying(true)}
          className="group absolute inset-0"
          aria-label={`Play ${title}`}
        >
          <Image
            src={`https://i.ytimg.com/vi/${youtubeKey}/hqdefault.jpg`}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover opacity-70 transition-opacity group-hover:opacity-90"
          />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-black transition-transform group-hover:scale-110">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
