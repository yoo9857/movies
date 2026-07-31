"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** One press: facts, runtime, synopsis and poster, from the open sources. */
export function EnrichMovieButton({ movieId }: { movieId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function enrich() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/movies/${movieId}/enrich`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        if (data?.filled?.length) router.refresh();
        else window.alert("Nothing new to fill — the sources have no more for this film.");
      } else {
        window.alert(data?.error ?? "Enrich failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={enrich}
      disabled={busy}
      title="Fill missing facts, synopsis and poster from the open sources"
      className="text-xs text-accent hover:opacity-80 disabled:opacity-50"
    >
      {busy ? "…" : "Enrich"}
    </button>
  );
}
