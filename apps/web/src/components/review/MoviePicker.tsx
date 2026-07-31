"use client";

// Searchable film picker. A plain <select> stops working the moment the
// library outgrows a screenful, so this filters as you type and stays
// keyboard-navigable.
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

export function MoviePicker({
  movies,
  value,
  onChange,
}: {
  movies: PickerMovie[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const selected = movies.find((m) => m.id === value) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return movies.slice(0, 40);
    return movies
      .filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.director ?? "").toLowerCase().includes(q) ||
          String(m.year ?? "").includes(q),
      )
      .slice(0, 40);
  }, [movies, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(m: PickerMovie) {
    onChange(m.id);
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
          {results.length === 0 ? (
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
