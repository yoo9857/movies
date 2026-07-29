"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface TmdbResult {
  id: number;
  title: string;
  release_date: string;
  overview: string;
  poster_path: string | null;
}

export function MovieImporter() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TmdbResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/tmdb/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed");
        setResults([]);
        return;
      }
      setResults(data.results);
      if (data.results.length === 0) setError("No results");
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function importMovie(tmdbId: number) {
    setImporting(tmdbId);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/movies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setImporting(null);
    }
  }

  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <input
          required
          maxLength={100}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search TMDB… e.g. Parasite"
          className="w-full max-w-md rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {results.length > 0 && (
        <ul className="mt-4 space-y-2">
          {results.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {r.title}{" "}
                  {r.release_date && (
                    <span className="text-muted">({r.release_date.slice(0, 4)})</span>
                  )}
                </p>
                <p className="line-clamp-1 text-xs text-muted">{r.overview}</p>
              </div>
              <button
                onClick={() => importMovie(r.id)}
                disabled={importing !== null}
                className="shrink-0 rounded border border-line px-3 py-1.5 text-xs hover:border-accent-dim disabled:opacity-50"
              >
                {importing === r.id ? "Importing…" : "Import"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
