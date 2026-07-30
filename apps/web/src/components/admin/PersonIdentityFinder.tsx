"use client";

// "Who is this, and is there a face for them?"
//
// A contact sheet, not a list: for a pick-the-right-person task the face is the
// whole signal, and the films they are known for are how you tell two Chris
// Evanses apart. Picking one links the identity and pulls the portrait into our
// storage in a single click.
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Candidate {
  tmdbId: number;
  name: string;
  department: string | null;
  thumbnail: string | null;
  hasPhoto: boolean;
  knownFor: string[];
}

export function PersonIdentityFinder({
  personId,
  name,
  linked,
}: {
  personId: string;
  name: string;
  /** Already has an upstream identity — searching again is a re-link. */
  linked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(name);
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/v1/admin/people/search?q=${encodeURIComponent(query.trim())}`);
      const data = (await res.json().catch(() => ({}))) as {
        results?: Candidate[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Search failed (${res.status})`);
        setResults(null);
        return;
      }
      setResults(data.results ?? []);
    } catch {
      setError("Network error during search.");
    } finally {
      setBusy(false);
    }
  }

  async function pick(tmdbId: number) {
    setPicking(tmdbId);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/v1/admin/people/${personId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        portraitError?: string | null;
      };
      if (!res.ok) {
        setError(data.error ?? `Link failed (${res.status})`);
        return;
      }
      setNote(
        data.portraitError
          ? `Linked, but the portrait failed: ${data.portraitError}`
          : "Linked, portrait stored, dates filled.",
      );
      setResults(null);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error — nothing was linked.");
    } finally {
      setPicking(null);
    }
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent-dim"
        >
          {linked ? "Re-link identity" : "Find this person"}
        </button>
        {note && <p className="text-xs text-positive">{note}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-accent-dim bg-accent/5 p-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name to search"
          className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
        >
          {busy ? "Searching…" : "Search"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setResults(null);
            setError(null);
          }}
          className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </form>

      {results !== null && results.length === 0 && (
        <p className="text-xs text-muted">
          Nobody found. This one is ours to research — upload a file above.
        </p>
      )}

      {results !== null && results.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {results.map((c) => (
            <li key={c.tmdbId}>
              <button
                type="button"
                disabled={picking !== null}
                onClick={() => void pick(c.tmdbId)}
                className="group flex w-full gap-2 rounded-lg border border-line bg-background p-2 text-left transition-colors hover:border-accent disabled:opacity-50"
              >
                {/* A contact sheet in a private tool — the only place an
                    upstream image URL is allowed to reach a browser. */}
                {c.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- picker thumbnail, not page media
                  <img
                    src={c.thumbnail}
                    alt=""
                    width={40}
                    height={54}
                    loading="lazy"
                    className="h-[54px] w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="grid h-[54px] w-10 shrink-0 place-items-center rounded bg-surface-raised font-mono text-[10px] text-muted">
                    none
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium group-hover:text-accent">
                    {picking === c.tmdbId ? "Linking…" : c.name}
                  </span>
                  {c.department && (
                    <span className="block truncate font-mono text-[10px] text-muted">
                      {c.department}
                    </span>
                  )}
                  {c.knownFor.length > 0 && (
                    <span className="block truncate text-[10px] text-muted">
                      {c.knownFor.join(", ")}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
