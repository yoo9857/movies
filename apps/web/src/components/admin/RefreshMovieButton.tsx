"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshMovieButton({ tmdbId }: { tmdbId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/admin/movies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId }),
      });
      if (res.ok) router.refresh();
      else {
        const data = await res.json().catch(() => null);
        window.alert(data?.error ?? "Refresh failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={refresh}
      disabled={busy}
      title="Re-import full data from TMDB"
      className="text-xs text-accent hover:opacity-80 disabled:opacity-50"
    >
      {busy ? "…" : "Refresh"}
    </button>
  );
}
