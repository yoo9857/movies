"use client";

// Find the article, pick the right person, take the photograph and the facts.
//
// A contact sheet again, for the same reason as the film-database picker: two
// people share a name far more often than a list of names can express, and the
// face plus Wikipedia's one-line description settles it instantly.
//
// The article's prose comes back as a draft rather than being saved. It is shown
// here to be read and rewritten — copying it into the bio would be both a
// licence obligation we have not met and a page with nothing of ours on it.
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Candidate {
  title: string;
  description: string | null;
  thumbnail: string | null;
  wikidataId: string | null;
  pageUrl: string;
}

export function WikiEnricher({
  personId,
  name,
  linked,
}: {
  personId: string;
  name: string;
  linked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(name);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/people/${personId}/enrich?q=${encodeURIComponent(query.trim())}`,
      );
      const data = (await res.json().catch(() => ({}))) as {
        candidates?: Candidate[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Search failed (${res.status})`);
        return;
      }
      setCandidates(data.candidates ?? []);
    } catch {
      setError("Network error during search.");
    } finally {
      setBusy(false);
    }
  }

  async function commit(title: string) {
    setCommitting(title);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/people/${personId}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        portraitError?: string | null;
        bioDraft?: string | null;
      };
      if (!res.ok) {
        setError(data.error ?? `Linking failed (${res.status})`);
        return;
      }
      setNote(
        data.portraitError
          ? `Linked and facts filled, but the photograph failed: ${data.portraitError}`
          : "Linked. Photograph stored with its credit, facts filled where blank.",
      );
      setDraft(data.bioDraft ?? null);
      setCandidates(null);
      router.refresh();
    } catch {
      setError("Network error — nothing was changed.");
    } finally {
      setCommitting(null);
    }
  }

  if (!open) {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent-dim"
        >
          {linked ? "Re-check Wikipedia" : "Find on Wikipedia"}
        </button>
        {note && <p className="text-xs text-positive">{note}</p>}
        {draft && <BioDraft text={draft} onDismiss={() => setDraft(null)} />}
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
          placeholder="Name to look up"
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
            setCandidates(null);
            setError(null);
          }}
          className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-foreground"
        >
          Close
        </button>
      </form>

      {candidates !== null && candidates.length === 0 && (
        <p className="text-xs text-muted">
          No article found. Upload a photograph by hand above, or try a different spelling.
        </p>
      )}

      {candidates !== null && candidates.length > 0 && (
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <li key={c.title}>
              <button
                type="button"
                disabled={committing !== null}
                onClick={() => void commit(c.title)}
                className="group flex w-full items-center gap-3 rounded-lg border border-line bg-background p-2 text-left transition-colors hover:border-accent disabled:opacity-50"
              >
                {c.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- picker thumbnail in a private tool
                  <img
                    src={c.thumbnail}
                    alt=""
                    width={38}
                    height={50}
                    loading="lazy"
                    className="h-[50px] w-[38px] shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="grid h-[50px] w-[38px] shrink-0 place-items-center rounded bg-surface-raised font-mono text-[10px] text-muted">
                    none
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium group-hover:text-accent">
                    {committing === c.title ? "Linking…" : c.title}
                  </span>
                  {c.description && (
                    <span className="block truncate text-[11px] text-muted">{c.description}</span>
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
      {note && <p className="text-xs text-positive">{note}</p>}
      {draft && <BioDraft text={draft} onDismiss={() => setDraft(null)} />}
    </div>
  );
}

/**
 * The article opening, shown for reference only.
 *
 * Deliberately not a "paste into bio" button. Wikipedia is CC BY-SA, and the
 * point of writing the bio here is that it reads like this site.
 */
function BioDraft({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-background p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Wikipedia says — reference, not copy
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11px] text-muted hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{text}</p>
      <p className="mt-2 text-[11px] text-accent/80">
        Write the bio in our own words — this text is CC BY-SA and belongs to its authors.
      </p>
    </div>
  );
}
