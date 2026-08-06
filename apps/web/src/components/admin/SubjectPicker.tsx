"use client";

/**
 * "Who and what is this piece about?" — one picker, two endpoints.
 *
 * People and films are chosen the same way and stored the same way (an ordered
 * list of ids), so they share a component rather than two near-copies. What
 * differs is the search URL and how a candidate reads, both passed in.
 *
 * Order is meaningful and editable. The first subject becomes `about` in the
 * post's JSON-LD and everything after it becomes `mentions` — so a piece on one
 * actor does not claim to be equally about the six films under them. That is why
 * there are move buttons rather than an alphabetical list.
 *
 * Every response is tagged with the query it answers, so a slow reply for "song"
 * cannot land under "song kang-ho".
 */
import { useEffect, useMemo, useState } from "react";

export interface Subject {
  id: string;
  /** The line the row shows — a name, or a title with its year. */
  label: string;
  /** The quieter second line: an occupation, a director, a credit count. */
  hint?: string | null;
}

const DEBOUNCE_MS = 180;

export function SubjectPicker({
  legend,
  placeholder,
  /** `?q=` is appended. */
  searchUrl,
  /** Pulls the subject list out of whatever shape the endpoint answers with. */
  parse,
  /** Subjects already chosen, resolved by the server so an edit screen can name them. */
  known,
  value,
  onChange,
}: {
  legend: string;
  placeholder: string;
  searchUrl: string;
  parse: (body: unknown) => Subject[];
  known: Subject[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState<{ q: string; subjects: Subject[] } | null>(null);

  const chosen = useMemo(() => new Set(value), [value]);

  // Chosen rows resolve out of what the server sent, plus anything picked from a
  // search — otherwise a subject added and re-rendered reads as unknown.
  const byId = useMemo(() => {
    const m = new Map(known.map((s) => [s.id, s]));
    for (const s of hit?.subjects ?? []) m.set(s.id, s);
    return m;
  }, [known, hit]);

  const q = query.trim();
  const candidates = useMemo(
    () => (hit?.q === q ? hit.subjects.filter((s) => !chosen.has(s.id)).slice(0, 10) : []),
    [hit, q, chosen],
  );
  const searching = q.length > 0 && hit?.q !== q;

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    let cancelled = false;
    const controller = new AbortController();
    // Every write is inside the timeout, so none is synchronous with the effect.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${searchUrl}?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const body: unknown = await res.json();
        if (cancelled) return;
        setHit({ q: term, subjects: parse(body) });
      } catch {
        if (!cancelled) setHit({ q: term, subjects: [] });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
    // `parse` is a stable literal at every call site; re-running on it would
    // refetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchUrl]);

  function move(index: number, by: number) {
    const next = [...value];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <fieldset className="rounded-lg border border-line p-4 text-sm">
      <legend className="px-1 text-muted">{legend}</legend>

      {value.length > 0 && (
        <ol className="mb-3 space-y-1.5">
          {value.map((id, i) => {
            const s = byId.get(id);
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border border-line bg-background px-3 py-2"
              >
                <span className="font-mono text-[11px] tabular-nums text-muted">
                  {i === 0 ? "about" : String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {s?.label ?? id}
                  {s?.hint && <span className="ml-2 text-xs text-muted">{s.hint}</span>}
                </span>
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="px-1.5 text-muted hover:text-foreground disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={i === value.length - 1}
                  onClick={() => move(i, 1)}
                  className="px-1.5 text-muted hover:text-foreground disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${s?.label ?? id}`}
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  className="px-1.5 text-muted hover:text-red-400"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        maxLength={100}
        className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />

      {searching && <p className="mt-2 text-xs text-muted">Searching…</p>}
      {!searching && q.length > 0 && candidates.length === 0 && (
        <p className="mt-2 text-xs text-muted">Nothing matches.</p>
      )}
      {candidates.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {candidates.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...value, s.id]);
                  setQuery("");
                }}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-surface"
              >
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {s.hint && <span className="shrink-0 text-xs text-muted">{s.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
