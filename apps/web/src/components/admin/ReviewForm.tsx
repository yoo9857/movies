"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface MovieOption {
  id: string;
  title: string;
  releaseDate: string | null;
}

export interface ReviewFormValues {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  rating: number;
  status: "DRAFT" | "PUBLISHED";
  movieId: string;
}

const EMPTY: ReviewFormValues = {
  slug: "",
  title: "",
  excerpt: "",
  content: "",
  rating: 7,
  status: "DRAFT",
  movieId: "",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 120);
}

export function ReviewForm({
  movies,
  initial,
  reviewId,
}: {
  movies: MovieOption[];
  initial?: ReviewFormValues;
  reviewId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ReviewFormValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));

  function set<K extends keyof ReviewFormValues>(key: K, value: ReviewFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...values,
        excerpt: values.excerpt || undefined,
        rating: Number(values.rating),
      };
      const res = await fetch(
        reviewId ? `/api/v1/admin/reviews/${reviewId}` : "/api/v1/admin/reviews",
        {
          method: reviewId ? "PUT" : "POST",
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
      router.push("/admin/reviews");
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
      <label className="block text-sm">
        <span className="text-muted">Title</span>
        <input
          required
          maxLength={200}
          value={values.title}
          onChange={(e) => {
            set("title", e.target.value);
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
        <span className="text-muted">Movie</span>
        <select
          required
          value={values.movieId}
          onChange={(e) => set("movieId", e.target.value)}
          className={inputCls}
        >
          <option value="">Select a movie…</option>
          {movies.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
              {m.releaseDate ? ` (${new Date(m.releaseDate).getFullYear()})` : ""}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted">
          Missing a movie? Import it first on the Movies page.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-muted">Rating (0–10, halves)</span>
          <input
            required
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={values.rating}
            onChange={(e) => set("rating", Number(e.target.value))}
            className={inputCls}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Status</span>
          <select
            value={values.status}
            onChange={(e) => set("status", e.target.value as "DRAFT" | "PUBLISHED")}
            className={inputCls}
          >
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-muted">Excerpt (optional, shown on cards)</span>
        <textarea
          rows={2}
          maxLength={500}
          value={values.excerpt}
          onChange={(e) => set("excerpt", e.target.value)}
          className={inputCls}
        />
      </label>

      <label className="block text-sm">
        <span className="text-muted">Content (Markdown)</span>
        <textarea
          required
          rows={16}
          value={values.content}
          onChange={(e) => set("content", e.target.value)}
          className={`${inputCls} font-mono`}
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : reviewId ? "Save changes" : "Create review"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/reviews")}
          className="rounded-lg border border-line px-5 py-2 text-sm hover:border-accent-dim"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
