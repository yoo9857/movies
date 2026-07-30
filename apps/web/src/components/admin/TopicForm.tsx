"use client";

// Where an editorial axis gets written.
//
// The definition is the field that matters: a topic without one is a tag, and a
// tag is what the site has deliberately decided not to publish. Films are
// assigned afterwards, on the topic's own page — so creating one lands there
// rather than back on the list.
import { TOPIC_KIND_LABELS, type TopicKind } from "@cinepixo/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface TopicFormValues {
  slug: string;
  name: string;
  kind: TopicKind;
  description: string;
  essay: string;
}

const EMPTY: TopicFormValues = {
  slug: "",
  name: "",
  kind: "THEME",
  description: "",
  essay: "",
};

/** Same grammar as the slug CHECK constraint: lowercase, digits, single hyphens. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 80)
    .replace(/-+$/, "");
}

const inputCls =
  "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent";

const KINDS: { value: TopicKind; hint: string }[] = [
  { value: "THEME", hint: "what a film is about" },
  { value: "MOTIF", hint: "what recurs on screen" },
];

export function TopicForm({
  initial,
  topicId,
}: {
  initial?: TopicFormValues;
  topicId?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState<TopicFormValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // An existing slug is a live URL; never re-derive it from a name edit.
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));

  function set<K extends keyof TopicFormValues>(key: K, value: TopicFormValues[K]) {
    setSaved(false);
    setV((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(topicId ? `/api/v1/admin/topics/${topicId}` : "/api/v1/admin/topics", {
        method: topicId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: v.slug,
          name: v.name,
          kind: v.kind,
          description: v.description,
          essay: v.essay,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: { path?: string; message?: string }[];
        topic?: { id: string };
      };
      if (!res.ok) {
        const detail = data.details?.[0];
        setError(detail ? `${detail.path}: ${detail.message}` : (data.error ?? "Save failed"));
        return;
      }
      if (!topicId && data.topic) {
        // Straight to the desk where films get assigned — a topic with no films
        // is the half-finished state this screen exists to close.
        router.push(`/admin/topics/${data.topic.id}`);
      } else {
        setSaved(true);
      }
      router.refresh();
    } catch {
      setError("Network error — nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-muted">Name</span>
          <input
            required
            maxLength={80}
            value={v.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
            placeholder="Class divide"
            className={inputCls}
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted">URL slug</span>
          <input
            required
            maxLength={80}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="lowercase letters, numbers and single hyphens"
            value={v.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
            className={`${inputCls} font-mono`}
          />
          {topicId && (
            <span className="mt-1 block text-xs text-muted">
              Changing this changes the public URL; the old one stops resolving.
            </span>
          )}
        </label>
      </div>

      <fieldset className="text-sm">
        <legend className="text-muted">Kind</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={`flex cursor-pointer items-baseline gap-2 rounded-lg border px-3 py-2 ${
                v.kind === k.value ? "border-accent text-foreground" : "border-line text-muted"
              }`}
            >
              <input
                type="radio"
                name="kind"
                className="sr-only"
                checked={v.kind === k.value}
                onChange={() => set("kind", k.value)}
              />
              <span className="font-medium">{TOPIC_KIND_LABELS[k.value]}</span>
              <span className="text-xs text-muted">{k.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className="text-muted">Definition — one sentence, shown on every card</span>
        <textarea
          rows={3}
          maxLength={300}
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          className={inputCls}
          placeholder="What the axis means, precisely enough that a film either carries it or does not."
        />
        <span className="mt-1 block font-mono text-[11px] text-muted tabular-nums">
          {v.description.length}/300
        </span>
      </label>

      <label className="block text-sm">
        <span className="text-muted">The reading — the essay for the topic page (optional)</span>
        <textarea
          rows={10}
          maxLength={10_000}
          value={v.essay}
          onChange={(e) => set("essay", e.target.value)}
          className={inputCls}
          placeholder={
            "Why this axis is worth drawing, how it reads across the films, what to watch first.\n\nMarkdown. This is the part no keyword list can hand you."
          }
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : topicId ? "Save changes" : "Create topic"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/topics")}
          className="rounded-lg border border-line px-5 py-2.5 text-sm hover:border-accent-dim"
        >
          {topicId ? "Back to topics" : "Cancel"}
        </button>
        {saved && <span className="text-sm text-positive">Saved.</span>}
      </div>
    </form>
  );
}
