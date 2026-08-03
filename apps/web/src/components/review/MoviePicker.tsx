"use client";

// Searchable film picker.
//
// It used to be handed the whole library and filter it in `useMemo`, which was a
// reasonable design for twenty-one films and a way to take the site down at
// 118,811: every page rendering the editor serialised the entire table into the
// RSC payload, stills and all. Now it asks /api/v1/movies/search, which filters
// where the trigram index is.
//
// Two things that matter for it still feeling instant:
//
//  · The caller passes `initial` — the newest films, plus whichever film is
//    already chosen — so the dropdown has something to show before a keystroke
//    and an edit screen can name its own film with no request at all.
//  · Typing is debounced and every response is checked against the query that is
//    current when it lands, so a slow reply for "bat" cannot overwrite the
//    results for "batman".
import { useEffect, useMemo, useRef, useState } from "react";

export interface PickerMovie {
  id: string;
  title: string;
  year: number | null;
  director: string | null;
  /** carried so the editor preview can render :::trailer and :::still for real */
  trailerKey?: string | null;
  stills?: string[];
}

const DEBOUNCE_MS = 180;

export function MoviePicker({
  initial,
  value,
  selected: selectedProp,
  onChange,
}: {
  /** Films to show before anything is typed. Include the chosen one. */
  initial: PickerMovie[];
  value: string;
  /** The chosen film, when the caller already knows it (an edit screen does). */
  selected?: PickerMovie | null;
  /** Reports the whole film, not just its id: the editor needs its stills. */
  onChange: (movie: PickerMovie) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  /**
   * The last answer, tagged with the query it answers.
   *
   * Results are *derived* from this rather than mirrored into their own state:
   * writing `initial` into state from an effect is a synchronous setState inside
   * an effect, which cascades renders — and tagging the answer is also what makes
   * a slow reply for "bat" unable to appear under "batman".
   */
  const [hit, setHit] = useState<{ q: string; movies: PickerMovie[] } | null>(null);
  const [failedQuery, setFailedQuery] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const q = query.trim();
  const results = q ? (hit?.q === q ? hit.movies : []) : initial;
  const loading = Boolean(q) && hit?.q !== q && failedQuery !== q;
  const failed = Boolean(q) && failedQuery === q;

  const selected = useMemo(
    () =>
      selectedProp ??
      initial.find((m) => m.id === value) ??
      hit?.movies.find((m) => m.id === value) ??
      null,
    [selectedProp, initial, hit, value],
  );

  useEffect(() => {
    const term = query.trim();
    if (!term) return;

    // `cancelled` as well as the AbortController: an aborted fetch and a
    // superseded one both have to leave state alone. Every write happens inside
    // the timeout, so none of them is synchronous with the effect.
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/movies/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { movies?: PickerMovie[] };
        if (cancelled) return;
        setHit({ q: term, movies: body.movies ?? [] });
        setFailedQuery(null);
      } catch {
        if (!cancelled) setFailedQuery(term);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(m: PickerMovie) {
    onChange(m);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative" ref={box}>
      {selected && !open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setCursor(0);
          }}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-background px-3 py-2 text-left text-sm transition-colors hover:border-accent-dim"
        >
          <span className="min-w-0 truncate">
            <span className="font-medium">{selected.title}</span>
            <span className="text-muted">
              {selected.year ? ` (${selected.year})` : ""}
              {selected.director ? ` · ${selected.director}` : ""}
            </span>
          </span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted">
            change
          </span>
        </button>
      ) : (
        <input
          autoFocus={open}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setCursor(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(results.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter" && results[cursor]) {
              e.preventDefault();
              pick(results[cursor]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Search the library — title, director or year"
          className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
      )}

      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-surface-raised py-1 shadow-2xl"
        >
          {loading && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">Searching…</li>
          ) : failed ? (
            <li className="px-3 py-2 text-sm text-muted">
              The search did not answer. Check the connection and try again.
            </li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">
              Nothing matches. If a film is missing, tell an admin — the library grows on request.
            </li>
          ) : (
            results.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={m.id === value}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(m)}
                  className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm ${
                    i === cursor ? "bg-surface" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{m.title}</span>
                    <span className="text-muted">
                      {m.year ? ` (${m.year})` : ""}
                      {m.director ? ` · ${m.director}` : ""}
                    </span>
                  </span>
                  {m.id === value && <span className="text-xs text-accent">selected</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
