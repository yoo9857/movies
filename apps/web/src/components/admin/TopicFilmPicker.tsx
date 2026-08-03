"use client";

// Assigning films to an axis, with the sentence that justifies each one.
//
// The note is the work: a topic page listing films without saying why is a tag
// cloud, so the note field sits on the row rather than behind a second click,
// and a row without one is flagged before saving rather than after.
//
// The whole list is sent on save. That mirrors the endpoint — assignment is
// curation, so there is no partial state to merge — and it means removing a
// film here is not a separate destructive request.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface PickerFilm {
  id: string;
  title: string;
  year: number | null;
  /** Already-resolved poster URL; the picker never builds one itself. */
  poster: string | null;
}

export interface Assignment {
  movieId: string;
  note: string;
}

const NOTE_MAX = 500;

const DEBOUNCE_MS = 180;

export function TopicFilmPicker({
  topicId,
  kindWord,
  assignedFilms,
  initial,
}: {
  topicId: string;
  /** "theme" or "motif" — the placeholder says which claim the note is making. */
  kindWord: string;
  /**
   * The films already on this axis, resolved. This used to be the *library* —
   * "a curated shelf of a few hundred titles at most, and a search endpoint for
   * that would be ceremony", which was true when it was written and wrong by
   * three orders of magnitude after the Wikidata import made it 118,811 rows.
   * Candidates come from `/api/v1/movies/search` now.
   */
  assignedFilms: PickerFilm[];
  initial: Assignment[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Assignment[]>(initial);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Search answers, tagged with the query they answer. */
  const [hit, setHit] = useState<{ q: string; films: PickerFilm[] } | null>(null);

  const assigned = useMemo(() => new Set(rows.map((r) => r.movieId)), [rows]);

  // Assigned rows resolve out of what the page sent, plus anything picked from a
  // search — otherwise a film added and then re-rendered reads as "no longer in
  // the library".
  const byId = useMemo(() => {
    const m = new Map(assignedFilms.map((f) => [f.id, f]));
    for (const f of hit?.films ?? []) m.set(f.id, f);
    return m;
  }, [assignedFilms, hit]);

  const q = query.trim();
  const candidates = useMemo(
    () => (hit?.q === q ? hit.films.filter((f) => !assigned.has(f.id)).slice(0, 12) : []),
    [hit, q, assigned],
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
        const res = await fetch(`/api/v1/movies/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          movies?: { id: string; title: string; year: number | null; poster: string | null }[];
        };
        if (cancelled) return;
        setHit({
          q: term,
          films: (body.movies ?? []).map((m) => ({
            id: m.id,
            title: m.title,
            year: m.year,
            poster: m.poster,
          })),
        });
      } catch {
        if (!cancelled) setHit({ q: term, films: [] });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const missingNotes = rows.filter((r) => r.note.trim() === "").length;

  function change(next: Assignment[]) {
    setSaved(false);
    setRows(next);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/topics/${topicId}/films`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // A blank note is normalised to null by the schema; the database would
        // reject an empty string outright.
        body: JSON.stringify({
          films: rows.map((r) => ({ movieId: r.movieId, note: r.note.trim() })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: { path?: string; message?: string }[];
      };
      if (!res.ok) {
        const detail = data.details?.[0];
        setError(detail ? `${detail.path}: ${detail.message}` : (data.error ?? "Save failed"));
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Network error — nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Films · {rows.length}
        </h2>
        {missingNotes > 0 && (
          <p className="font-mono text-[11px] text-muted">
            {missingNotes} without a note — the page will list them as a bare title
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          No films yet. An axis with nothing under it publishes as an empty page.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const film = byId.get(r.movieId);
            return (
              <li
                key={r.movieId}
                className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface p-3"
              >
                {film?.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-only thumbnail off the TMDB CDN
                  <img
                    src={film.poster}
                    alt=""
                    width={32}
                    height={48}
                    className="h-12 w-8 shrink-0 rounded border border-line object-cover"
                  />
                ) : (
                  <span className="h-12 w-8 shrink-0 rounded border border-line bg-background" />
                )}

                <div className="min-w-[12rem] flex-1">
                  <p className="text-sm font-medium">
                    {film?.title ?? "(film no longer in the library)"}
                    {film?.year != null && (
                      <span className="ml-2 font-mono text-[11px] text-muted">{film.year}</span>
                    )}
                  </p>
                  <input
                    value={r.note}
                    maxLength={NOTE_MAX}
                    onChange={(e) =>
                      change(rows.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))
                    }
                    placeholder={`How the ${kindWord} shows up in this film — one sentence`}
                    className="mt-1.5 w-full rounded-lg border border-line bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => change(rows.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-red-400 hover:bg-background"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-xl border border-line p-4">
        <label className="block text-sm">
          <span className="text-muted">Add a film</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the library by title, director or year"
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {candidates.length === 0 ? (
            <p className="text-xs text-muted">
              {/* An empty box no longer means "nothing left" — the library is not
                  in memory to be listed, so the honest prompt is to type. */}
              {q === ""
                ? "Type to search the library."
                : searching
                  ? "Searching…"
                  : "No match, or every match is already assigned."}
            </p>
          ) : (
            candidates.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  change([...rows, { movieId: f.id, note: "" }]);
                  setQuery("");
                }}
                className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:border-accent-dim hover:text-foreground"
              >
                {f.title}
                {f.year != null && <span className="ml-1.5 font-mono text-[10px]">{f.year}</span>}
              </button>
            ))
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save film list"}
        </button>
        {saved && <span className="text-sm text-positive">Saved.</span>}
      </div>
    </section>
  );
}
