"use client";

// Where a person stops being a credit and becomes something we know about.
//
// Everything on this form is ours to write. `notes` is the field that makes the
// page worth visiting — TMDB can tell anyone a birth date; only we can say what
// to watch first and who they keep working with.
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface PersonDraft {
  slug: string;
  name: string;
  bio: string;
  notes: string;
  birthPlace: string;
  deathPlace: string;
  birthDate: string;
  deathDate: string;
  links: { label: string; url: string }[];
}

const input =
  "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block text-sm";

export function PersonForm({
  personId,
  initial,
}: {
  personId: string;
  initial: PersonDraft;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof PersonDraft>(k: K, value: PersonDraft[K]) {
    setSaved(false);
    setV((prev) => ({ ...prev, [k]: value }));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/people/${personId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...v,
          // Drop half-filled link rows rather than failing the whole save.
          links: v.links.filter((l) => l.label.trim() && l.url.trim()),
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
    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          <span className="text-muted">Name</span>
          <input
            maxLength={120}
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            className={input}
          />
        </label>
        <label className={label}>
          <span className="text-muted">URL slug</span>
          <input
            maxLength={130}
            value={v.slug}
            onChange={(e) => set("slug", e.target.value)}
            className={`${input} font-mono`}
          />
          <span className="mt-1 block text-xs text-muted">
            Changing this changes their public URL; the old one stops resolving.
          </span>
        </label>
      </div>

      <label className={label}>
        <span className="text-muted">Bio — who they are, in our words</span>
        <textarea
          rows={4}
          maxLength={2000}
          value={v.bio}
          onChange={(e) => set("bio", e.target.value)}
          className={input}
        />
      </label>

      <label className={label}>
        <span className="text-muted">
          Notes — career shape, recurring collaborators, what to watch first
        </span>
        <textarea
          rows={7}
          maxLength={4000}
          value={v.notes}
          onChange={(e) => set("notes", e.target.value)}
          className={input}
          placeholder={
            "Shown as its own section on their page.\n\nThis is the part no database hands you — the argument about a career rather than the facts of it."
          }
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          <span className="text-muted">Born</span>
          <input
            type="date"
            value={v.birthDate}
            onChange={(e) => set("birthDate", e.target.value)}
            className={input}
          />
        </label>
        <label className={label}>
          <span className="text-muted">Died</span>
          <input
            type="date"
            value={v.deathDate}
            onChange={(e) => set("deathDate", e.target.value)}
            className={input}
          />
        </label>
        <label className={label}>
          <span className="text-muted">Birthplace</span>
          <input
            maxLength={160}
            value={v.birthPlace}
            onChange={(e) => set("birthPlace", e.target.value)}
            className={input}
          />
        </label>
        <label className={label}>
          <span className="text-muted">Place of death</span>
          <input
            maxLength={160}
            value={v.deathPlace}
            onChange={(e) => set("deathPlace", e.target.value)}
            className={input}
          />
        </label>
      </div>

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Links — identity claims, so verified ones only
        </legend>
        <div className="space-y-2">
          {v.links.map((l, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input
                value={l.label}
                onChange={(e) =>
                  set(
                    "links",
                    v.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  )
                }
                placeholder="Label"
                className="w-40 rounded-lg border border-line bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
              <input
                value={l.url}
                onChange={(e) =>
                  set(
                    "links",
                    v.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                  )
                }
                placeholder="https://…"
                className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => set("links", v.links.filter((_, j) => j !== i))}
                className="rounded-lg px-3 py-1.5 text-xs text-red-400 hover:bg-surface"
              >
                Remove
              </button>
            </div>
          ))}
          {v.links.length < 10 && (
            <button
              type="button"
              onClick={() => set("links", [...v.links, { label: "", url: "" }])}
              className="text-xs text-accent hover:opacity-80"
            >
              + Add link
            </button>
          )}
        </div>
      </fieldset>

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
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-positive">Saved.</span>}
      </div>
    </form>
  );
}
