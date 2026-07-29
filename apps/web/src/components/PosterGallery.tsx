"use client";

// Alternate artwork. Click a thumbnail to swap the large view — no lightbox,
// no library, keyboard reachable.
import Image from "next/image";
import { useState } from "react";
import { SectionHead } from "./ReelDivider";

export interface ArtworkEntry {
  id: string;
  path: string;
  kind: string;
}

export function PosterGallery({ artwork, title }: { artwork: ArtworkEntry[]; title: string }) {
  const posters = artwork.filter((a) => a.kind === "poster");
  const stills = artwork.filter((a) => a.kind === "backdrop");
  const [poster, setPoster] = useState(0);
  const [still, setStill] = useState(0);

  if (posters.length === 0 && stills.length === 0) return null;

  return (
    <section aria-label="Artwork" className="grid gap-8 sm:grid-cols-[auto_1fr]">
      {posters.length > 0 && (
        <div>
          <SectionHead>
            {posters.length > 1 ? `Posters · ${posters.length}` : "Poster"}
          </SectionHead>
          <div className="mt-3 flex gap-4">
            <Image
              key={posters[poster].path}
              src={`https://image.tmdb.org/t/p/w342${posters[poster].path}`}
              alt={`${title} poster`}
              width={342}
              height={513}
              className="h-64 w-auto rounded-lg border border-line object-contain"
            />
            {posters.length > 1 && (
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
              {posters.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setPoster(i)}
                  aria-label={`Poster ${i + 1}`}
                  aria-current={i === poster}
                  className={`overflow-hidden rounded border transition-colors ${
                    i === poster ? "border-accent" : "border-line hover:border-accent-dim"
                  }`}
                >
                  <Image
                    src={`https://image.tmdb.org/t/p/w185${p.path}`}
                    alt=""
                    width={185}
                    height={278}
                    className="h-14 w-auto object-cover"
                  />
                </button>
              ))}
            </div>
            )}
          </div>
        </div>
      )}

      {stills.length > 0 && (
        <div className="min-w-0">
          <SectionHead>{stills.length > 1 ? `Stills · ${stills.length}` : "Still"}</SectionHead>
          <div className="mt-3 space-y-2">
            <Image
              key={stills[still].path}
              src={`https://image.tmdb.org/t/p/w780${stills[still].path}`}
              alt={`${title} still`}
              width={780}
              height={439}
              className="aspect-video w-full rounded-lg border border-line object-cover"
            />
            {stills.length > 1 && (
              <div className="cx-rail">
                {stills.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setStill(i)}
                    aria-label={`Still ${i + 1}`}
                    aria-current={i === still}
                    className={`overflow-hidden rounded border transition-colors ${
                      i === still ? "border-accent" : "border-line hover:border-accent-dim"
                    }`}
                  >
                    <Image
                      src={`https://image.tmdb.org/t/p/w185${s.path}`}
                      alt=""
                      width={185}
                      height={104}
                      className="h-12 w-auto object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
