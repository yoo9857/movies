"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface CriticFormValues {
  slug: string;
  name: string;
  bio: string;
  avatarUrl: string;
  links: { label: string; url: string }[];
}

const EMPTY: CriticFormValues = { slug: "", name: "", bio: "", avatarUrl: "", links: [] };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 120);
}

const inputCls =
  "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function CriticForm({
  initial,
  criticId,
}: {
  initial?: CriticFormValues;
  criticId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CriticFormValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));

  function set<K extends keyof CriticFormValues>(key: K, value: CriticFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function setLink(i: number, patch: Partial<{ label: string; url: string }>) {
    setValues((v) => ({
      ...v,
      links: v.links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        slug: values.slug,
        name: values.name,
        bio: values.bio || undefined,
        avatarUrl: values.avatarUrl || undefined,
        links: values.links.filter((l) => l.label && l.url),
      };
      const res = await fetch(
        criticId ? `/api/v1/admin/critics/${criticId}` : "/api/v1/admin/critics",
        {
          method: criticId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        const detail = data.details?.[0];
        setError(detail ? `${detail.path}: ${detail.message}` : (data.error ?? "Save failed"));
        return;
      }
      router.push("/admin/critics");
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <label className="block text-sm">
        <span className="text-muted">Name</span>
        <input
          required
          maxLength={100}
          value={values.name}
          onChange={(e) => {
            set("name", e.target.value);
            if (!slugTouched) set("slug", slugify(e.target.value));
          }}
          className={inputCls}
        />
      </label>

      <label className="block text-sm">
        <span className="text-muted">Slug (URL)</span>
        <input
          required
          maxLength={120}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          title="lowercase letters, numbers and hyphens"
          value={values.slug}
          onChange={(e) => {
            setSlugTouched(true);
            set("slug", e.target.value);
          }}
          className={`${inputCls} font-mono`}
        />
      </label>

      <label className="block text-sm">
        <span className="text-muted">Bio</span>
        <textarea
          rows={4}
          maxLength={2000}
          value={values.bio}
          onChange={(e) => set("bio", e.target.value)}
          className={inputCls}
        />
      </label>

      <label className="block text-sm">
        <span className="text-muted">Avatar URL (https, optional)</span>
        <input
          type="url"
          maxLength={500}
          value={values.avatarUrl}
          onChange={(e) => set("avatarUrl", e.target.value)}
          className={inputCls}
        />
      </label>

      <fieldset className="text-sm">
        <legend className="text-muted">Links (max 10)</legend>
        <div className="mt-1 space-y-2">
          {values.links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input
                placeholder="Label"
                maxLength={50}
                value={l.label}
                onChange={(e) => setLink(i, { label: e.target.value })}
                className={`${inputCls} mt-0 w-40`}
              />
              <input
                placeholder="https://…"
                type="url"
                maxLength={500}
                value={l.url}
                onChange={(e) => setLink(i, { url: e.target.value })}
                className={`${inputCls} mt-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => set("links", values.links.filter((_, idx) => idx !== i))}
                className="shrink-0 rounded border border-line px-2 text-xs text-muted hover:border-red-400 hover:text-red-400"
                aria-label="Remove link"
              >
                ✕
              </button>
            </div>
          ))}
          {values.links.length < 10 && (
            <button
              type="button"
              onClick={() => set("links", [...values.links, { label: "", url: "" }])}
              className="rounded border border-line px-3 py-1.5 text-xs text-muted hover:border-accent-dim hover:text-foreground"
            >
              + Add link
            </button>
          )}
        </div>
      </fieldset>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : criticId ? "Save changes" : "Add critic"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/critics")}
          className="rounded-lg border border-line px-5 py-2 text-sm hover:border-accent-dim"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
