"use client";

import { countWords, readingMinutes } from "@cinepixo/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReviewBody, type ReviewMedia } from "./ReviewBody";
import { MoviePicker, type PickerMovie } from "./MoviePicker";
import { StarPicker } from "./StarPicker";

export interface ReviewDraft {
  slug: string;
  title: string;
  excerpt: string;
  verdict: string;
  content: string;
  rating: number;
  status: "DRAFT" | "PUBLISHED";
  spoilers: "NONE" | "MILD" | "FULL";
  movieId: string;
}

const EMPTY: ReviewDraft = {
  slug: "",
  title: "",
  excerpt: "",
  verdict: "",
  content: "",
  rating: 7,
  status: "DRAFT",
  spoilers: "NONE",
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

const input =
  "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block text-sm";
const legend = "font-mono text-[10px] uppercase tracking-[0.14em] text-muted";

export function ReviewEditor({
  movies,
  initial,
  reviewId,
  apiBase = "/api/v1/my/reviews",
  doneHref = "/me/reviews",
}: {
  movies: PickerMovie[];
  initial?: ReviewDraft;
  reviewId?: string;
  apiBase?: string;
  doneHref?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState<ReviewDraft>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [serverState, setServerState] = useState<"idle" | "saving" | "saved" | "local">("idle");
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = useRef(false);
  // Set once the server has a draft row for this piece, so later autosaves
  // update it instead of creating a pile of drafts.
  const draftId = useRef<string | null>(reviewId ?? null);

  // Local autosave key is per-review so a draft and an edit never collide.
  const storeKey = `cinepixo:draft:${reviewId ?? "new"}`;
  // Published reviews are only ever changed through the validated Save path.
  const serverDrafts = v.status !== "PUBLISHED";

  function set<K extends keyof ReviewDraft>(k: K, value: ReviewDraft[K]) {
    dirty.current = true;
    setV((prev) => ({ ...prev, [k]: value }));
  }

  // ── Restore an unsaved draft ──
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storeKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { at: string; draft: ReviewDraft };
      if (saved?.draft?.content || saved?.draft?.title) {
        setV(saved.draft);
        setRestored(true);
      }
    } catch {
      /* a corrupt draft is simply ignored */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Autosave: this browser first (instant, offline-proof) ──
  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          storeKey,
          JSON.stringify({ at: new Date().toISOString(), draft: v }),
        );
        setSavedAt(new Date().toLocaleTimeString("en-US", { timeStyle: "short" }));
      } catch {
        /* storage full or blocked — saving is best-effort */
      }
    }, 900);
    return () => window.clearTimeout(t);
  }, [v, storeKey]);

  // ── Autosave: then the server, so the draft survives this device ──
  useEffect(() => {
    if (!dirty.current || !serverDrafts) return;
    // Nothing to attach a draft to until a film is chosen, and no point
    // storing an untouched shell.
    if (!v.movieId || (!v.content.trim() && !v.title.trim())) {
      setServerState("local");
      return;
    }
    const t = window.setTimeout(async () => {
      setServerState("saving");
      try {
        const res = await fetch("/api/v1/my/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...v, id: draftId.current ?? undefined }),
        });
        if (!res.ok) {
          setServerState("local");
          return;
        }
        const data = await res.json();
        draftId.current = data.id;
        setServerState("saved");
      } catch {
        // offline or blocked — the local copy above is still authoritative
        setServerState("local");
      }
    }, 4000);
    return () => window.clearTimeout(t);
  }, [v, serverDrafts]);

  // ── Guard against losing work ──
  useEffect(() => {
    function onLeave(e: BeforeUnloadEvent) {
      if (dirty.current) e.preventDefault();
    }
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  // ── Markdown toolbar ──
  const wrap = useCallback(
    (before: string, after = before, placeholder = "") => {
      const el = area.current;
      if (!el) return;
      const { selectionStart: s, selectionEnd: e, value } = el;
      const picked = value.slice(s, e) || placeholder;
      const next = value.slice(0, s) + before + picked + after + value.slice(e);
      dirty.current = true;
      setV((prev) => ({ ...prev, content: next }));
      // put the caret inside what we just inserted
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(s + before.length, s + before.length + picked.length);
      });
    },
    [],
  );

  const block = useCallback((snippet: string) => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, value } = el;
    const atLineStart = s === 0 || value[s - 1] === "\n";
    const text = (atLineStart ? "" : "\n") + snippet;
    const next = value.slice(0, s) + text + value.slice(s);
    dirty.current = true;
    setV((prev) => ({ ...prev, content: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + text.length, s + text.length);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...v,
        excerpt: v.excerpt || undefined,
        verdict: v.verdict || undefined,
        rating: Number(v.rating),
      };
      // If autosave already created a server draft, publish updates that row
      // rather than creating a second review.
      const target = reviewId ?? draftId.current;
      const res = await fetch(target ? `${apiBase}/${target}` : apiBase, {
        method: target ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const d = data.details?.[0];
        setError(d ? `${d.path}: ${d.message}` : (data.error ?? "Save failed"));
        return;
      }
      dirty.current = false;
      window.localStorage.removeItem(storeKey);
      router.push(doneHref);
      router.refresh();
    } catch {
      setError("Network error — your draft is saved in this browser, try again.");
    } finally {
      setBusy(false);
    }
  }

  const media: ReviewMedia = { title: "This film", trailerKey: null, stills: [] };
  const words = countWords(v.content);
  const minutes = readingMinutes(v.content);

  const tool =
    "rounded border border-line px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-accent-dim hover:text-foreground";

  return (
    <form onSubmit={submit} className="space-y-6">
      {restored && (
        <p className="flex flex-wrap items-center gap-3 rounded-lg border border-accent-dim bg-accent/10 px-4 py-2.5 text-sm">
          <span>Restored an unsaved draft from this browser.</span>
          <button
            type="button"
            onClick={() => {
              window.localStorage.removeItem(storeKey);
              setV(initial ?? EMPTY);
              setRestored(false);
              dirty.current = false;
            }}
            className="font-semibold text-accent underline underline-offset-2"
          >
            Discard it
          </button>
        </p>
      )}

      {/* ── The film and the score ── */}
      <fieldset className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <legend className={legend}>The film and your score</legend>
        <div>
          <span className="text-sm text-muted">Film</span>
          <div className="mt-1">
            <MoviePicker movies={movies} value={v.movieId} onChange={(id) => set("movieId", id)} />
          </div>
        </div>
        <div>
          <span className="text-sm text-muted">Rating</span>
          <div className="mt-2">
            <StarPicker value={v.rating} onChange={(r) => set("rating", r)} />
          </div>
        </div>
      </fieldset>

      {/* ── Headline material ── */}
      <fieldset className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <legend className={legend}>How it is introduced</legend>

        <label className={label}>
          <span className="text-muted">Title</span>
          <input
            required
            maxLength={200}
            value={v.title}
            onChange={(e) => {
              set("title", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
            placeholder="Crossing the Line — Rewatching Parasite"
            className={input}
          />
        </label>

        <label className={label}>
          <span className="text-muted">The verdict — your conclusion in one line</span>
          <input
            maxLength={300}
            value={v.verdict}
            onChange={(e) => set("verdict", e.target.value)}
            placeholder="Bong draws class with architecture instead of dialogue, and it still lands."
            className={input}
          />
          <span className="mt-1 block text-xs text-muted">
            Shown above the review, next to your score. Leave it blank and we&apos;ll phrase one
            from the rating.
          </span>
        </label>

        <label className={label}>
          <span className="text-muted">Excerpt — the teaser on cards and listings</span>
          <textarea
            rows={2}
            maxLength={500}
            value={v.excerpt}
            onChange={(e) => set("excerpt", e.target.value)}
            className={input}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            <span className="text-muted">Spoilers</span>
            <select
              value={v.spoilers}
              onChange={(e) => set("spoilers", e.target.value as ReviewDraft["spoilers"])}
              className={input}
            >
              <option value="NONE">Spoiler-free</option>
              <option value="MILD">Minor spoilers</option>
              <option value="FULL">Full spoilers</option>
            </select>
          </label>
          <label className={label}>
            <span className="text-muted">URL slug</span>
            <input
              required
              maxLength={120}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="lowercase letters, numbers and hyphens"
              value={v.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
              className={`${input} font-mono`}
            />
          </label>
        </div>
      </fieldset>

      {/* ── The review itself ── */}
      <fieldset className="rounded-xl border border-line bg-surface p-5">
        <legend className={legend}>The review</legend>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <div className="mr-auto flex gap-1.5 rounded-lg border border-line p-0.5">
            {(["write", "preview"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                  tab === t ? "bg-accent text-black" : "text-muted hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="font-mono text-[11px] text-muted">
            {words.toLocaleString("en-US")} words · {minutes} min read
            {savedAt && (
              <span className="ml-2 text-accent/80">
                {serverState === "saving"
                  ? "saving…"
                  : serverState === "saved"
                    ? `saved to your account ${savedAt}`
                    : `saved in this browser ${savedAt}`}
              </span>
            )}
          </span>
        </div>

        {tab === "write" ? (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button type="button" className={tool} onClick={() => wrap("**", "**", "bold")}>
                B
              </button>
              <button type="button" className={`${tool} italic`} onClick={() => wrap("*", "*", "italic")}>
                I
              </button>
              <button type="button" className={tool} onClick={() => wrap("==", "==", "highlight")}>
                highlight
              </button>
              <button type="button" className={tool} onClick={() => block("## Section\n\n")}>
                H2
              </button>
              <button type="button" className={tool} onClick={() => block("> A line worth pulling out\n\n")}>
                pull quote
              </button>
              <button type="button" className={tool} onClick={() => block("- point\n- point\n\n")}>
                list
              </button>
              <button type="button" className={tool} onClick={() => wrap("[", "](https://)", "link text")}>
                link
              </button>
              <span className="mx-1 w-px bg-line" aria-hidden="true" />
              <button
                type="button"
                className={tool}
                onClick={() => block(":::spoiler\nWhat happens in the third act…\n:::\n\n")}
              >
                spoiler block
              </button>
              <button type="button" className={tool} onClick={() => block(":::trailer\n\n")}>
                trailer
              </button>
              <button type="button" className={tool} onClick={() => block(":::still 1\n\n")}>
                still
              </button>
            </div>

            <textarea
              ref={area}
              required
              rows={22}
              value={v.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder={"## Space is class\n\nIn *Parasite* the camera never stops moving vertically…\n\n> The film never explains class through dialogue. You feel it.\n\n:::trailer\n\n:::spoiler\nThe basement reveal changes everything about the first hour.\n:::"}
              className={`${input} font-mono leading-relaxed`}
            />

            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer">Formatting reference</summary>
              <ul className="mt-2 space-y-1 font-mono">
                <li>## Section · ### Subsection — become the table of contents</li>
                <li>&gt; line — a pull quote, set large</li>
                <li>==text== — highlighted phrase</li>
                <li>**bold** · *italic* · [link](https://…) · - list</li>
                <li>:::spoiler … ::: — hidden until the reader reveals it</li>
                <li>:::trailer — the film&apos;s trailer, inline</li>
                <li>:::still 2 — still #2 from the film</li>
              </ul>
            </details>
          </>
        ) : (
          <div className="mt-4 rounded-lg border border-line bg-background p-5">
            {v.content.trim() ? (
              <ReviewBody content={v.content} media={media} />
            ) : (
              <p className="text-sm text-muted">Nothing to preview yet.</p>
            )}
            <p className="mt-6 border-t border-line pt-3 text-xs text-muted">
              Trailers and stills render on the published page, where the film is known.
            </p>
          </div>
        )}
      </fieldset>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          onClick={() => set("status", "PUBLISHED")}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : reviewId ? "Save and publish" : "Publish review"}
        </button>
        <button
          type="submit"
          disabled={busy}
          onClick={() => set("status", "DRAFT")}
          className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:border-accent-dim disabled:opacity-50"
        >
          Save as draft
        </button>
        <button
          type="button"
          onClick={() => {
            dirty.current = false;
            router.push(doneHref);
          }}
          className="text-sm text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
