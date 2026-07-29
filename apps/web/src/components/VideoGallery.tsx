"use client";

// Several trailers/teasers/clips with a picker. Nothing loads from YouTube
// until a viewer presses play — the default state is a static thumbnail.
import Image from "next/image";
import { useState } from "react";
import { SectionHead } from "./ReelDivider";

export interface VideoEntry {
  id: string;
  youtubeKey: string;
  name: string;
  type: string;
  official: boolean;
}

export function VideoGallery({ videos, title }: { videos: VideoEntry[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  if (videos.length === 0) return null;

  const current = videos[Math.min(index, videos.length - 1)];

  return (
    <section aria-label="Videos">
      <SectionHead
        action={
          videos.length > 1 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {videos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => {
                  setIndex(i);
                  setPlaying(false);
                }}
                aria-current={i === index}
                className={
                  i === index
                    ? "font-semibold text-accent underline underline-offset-4"
                    : "text-muted transition-colors hover:text-foreground"
                }
              >
                {v.type}
                {videos.filter((x) => x.type === v.type).length > 1 && (
                  <span className="ml-1 font-mono text-[10px]">
                    {videos.filter((x) => x.type === v.type).indexOf(v) + 1}
                  </span>
                )}
              </button>
            ))}
            </div>
          ) : null
        }
      >
        Videos · {videos.length}
      </SectionHead>

      <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
        {playing ? (
          <iframe
            key={current.youtubeKey}
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(current.youtubeKey)}?autoplay=1&rel=0`}
            title={`${title} — ${current.name}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            onClick={() => setPlaying(true)}
            className="group absolute inset-0"
            aria-label={`Play ${current.name}`}
          >
            <Image
              key={current.youtubeKey}
              src={`https://i.ytimg.com/vi/${current.youtubeKey}/hqdefault.jpg`}
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
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/85 to-transparent p-4 text-left">
              <span className="line-clamp-1 text-sm font-medium">{current.name}</span>
              {current.official && (
                <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent">
                  official
                </span>
              )}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
