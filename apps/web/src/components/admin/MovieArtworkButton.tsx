"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * The poster swap, at the desk.
 *
 * The fill scripts never displace artwork and the replace API existed with no
 * hand on it — this is the hand. "Swap" opens the file picker and posts the
 * file; "URL" asks for an address to import; "×" clears back to the TMDB path
 * or the house card. All three land on /api/v1/admin/movies/[id]/artwork.
 */
export function MovieArtworkButton({ movieId, hasOwn }: { movieId: string; hasOwn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function send(init: RequestInit) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/movies/${movieId}/artwork`, init);
      if (res.ok) router.refresh();
      else {
        const data = await res.json().catch(() => null);
        window.alert(data?.error ?? "Artwork update failed");
      }
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File | null) {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    void send({ method: "POST", body });
  }

  function fromUrl() {
    const url = window.prompt("Image URL to import (fetched once, stored on our origin):");
    if (!url) return;
    void send({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  }

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <button
        onClick={() => fileInput.current?.click()}
        disabled={busy}
        title="Replace the poster with a file from this machine"
        className="text-xs text-accent hover:opacity-80 disabled:opacity-50"
      >
        {busy ? "…" : "Poster"}
      </button>
      <button
        onClick={fromUrl}
        disabled={busy}
        title="Replace the poster by importing an image URL"
        className="text-xs text-accent hover:opacity-80 disabled:opacity-50"
      >
        URL
      </button>
      {hasOwn && (
        <button
          onClick={() => {
            if (window.confirm("Remove this film's own artwork? It falls back to TMDB or the house card."))
              void send({ method: "DELETE" });
          }}
          disabled={busy}
          title="Remove our artwork (falls back to TMDB path or house card)"
          className="text-xs text-muted hover:text-foreground disabled:opacity-50"
        >
          ×
        </button>
      )}
    </span>
  );
}
