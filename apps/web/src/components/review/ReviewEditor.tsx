"use client";

import { countWords, readingMinutes } from "@cinepixo/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { RichEditor, type UploadedImage } from "./editor/RichEditor";
import { EditorToolbar, Glyphs, type ToolAction } from "./EditorToolbar";
import { MoviePicker, type PickerMovie } from "./MoviePicker";
import { ReviewBody, type ReviewMedia } from "./ReviewBody";
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

/**
 * Shortcut hints are rendered on the server too, so they cannot depend on
 * `navigator` — a Mac reading "⌘" after the server wrote "Ctrl" is a hydration
 * mismatch. Naming both keys is honest on either platform.
 */
const MOD = "⌘/Ctrl";

/* ───────────────────────── the stored local draft ───────────────────────── */

interface StoredDraft {
  at: string;
  draft: ReviewDraft;
}

function parseStored(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed?.draft) return null;
    // Only worth offering if there is prose or a headline in it.
    if (!parsed.draft.content?.trim() && !parsed.draft.title?.trim()) return null;
    return parsed;
  } catch {
    return null; // a corrupt draft is simply ignored
  }
}

// `useSyncExternalStore` with a server snapshot of `null` is the sanctioned way
// to read a client-only store: the server and the hydration pass both see "no
// draft", then React re-renders once with the real value. Doing it in an effect
// instead would set state during the commit and cascade a second render.
//
// The snapshot is cached in a ref so it is read exactly once. It must not track
// later writes — we write to this key on every autosave, and a live snapshot
// would pop the "restore?" banner back up in response to our own saving.
const NO_SUBSCRIBE = () => () => {};

/* ─────────────────────────────── the editor ─────────────────────────────── */

type SlugState = "unknown" | "checking" | "free" | "taken" | "invalid";

export function ReviewEditor({
  movies,
  initial,
  reviewId,
  apiBase = "/api/v1/my/reviews",
  doneHref = "/me/reviews",
  draftSync = true,
  canPublish = true,
}: {
  /**
   * Films to seed the picker with: the newest few, plus the one this review is
   * already about. It is **not** the library — the picker searches the server for
   * the rest. Handing over all 118,811 rows is what made every page rendering
   * this editor able to take the site down.
   */
  movies: PickerMovie[];
  initial?: ReviewDraft;
  reviewId?: string;
  apiBase?: string;
  doneHref?: string;
  /**
   * Whether autosave may write to `/api/v1/my/drafts`. That endpoint only
   * touches the caller's own rows, so on the admin edit page — where the review
   * usually belongs to someone else — it answered 404 to every autosave, once
   * every four seconds, forever. Admin pages pass `false`: autosave stays in
   * this browser and Ctrl+S saves in place through the admin API instead.
   */
  draftSync?: boolean;
  /** False when this byline still needs a public biography. */
  canPublish?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<ReviewDraft>(initial ?? EMPTY);
  /**
   * Every film this editor has seen — the seed list, plus anything picked out of
   * a search result. The preview reads the chosen film's trailer and stills from
   * here, because the picker no longer holds the library it could look them up in.
   */
  const [knownMovies, setKnownMovies] = useState<Map<string, PickerMovie>>(
    () => new Map(movies.map((m) => [m.id, m])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  // "write" is the visual editor — formatting stays formatting, no markdown
  // syntax on screen. "markdown" is the same document as source, for anyone
  // who wants the plumbing; "split" pairs that source with a live preview.
  const [tab, setTab] = useState<"write" | "markdown" | "split" | "preview">("write");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [serverState, setServerState] = useState<"idle" | "saving" | "saved" | "local">("idle");
  const [restoreHandled, setRestoreHandled] = useState(false);
  const [remoteSlug, setRemoteSlug] = useState<{ slug: string; state: SlugState } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  // Two copies of one fact, on purpose. The ref is read synchronously by the
  // effects and by the beforeunload handler, where a stale render closure would
  // be wrong; the state exists so the "unsaved" badge actually re-renders, which
  // a ref alone cannot make happen.
  const dirty = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  // Set once the server has a draft row for this piece, so later autosaves
  // update it instead of creating a pile of drafts.
  const draftId = useRef<string | null>(reviewId ?? null);

  // Local autosave key is per-review so a draft and an edit never collide.
  const storeKey = `cinepixo:draft:${reviewId ?? "new"}`;
  // Published reviews are only ever changed through the validated Save path.
  const serverDrafts = draftSync && v.status !== "PUBLISHED";

  const snapshot = useRef<string | null | undefined>(undefined);
  const storedRaw = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => {
      if (snapshot.current === undefined) {
        try {
          snapshot.current = window.localStorage.getItem(storeKey);
        } catch {
          snapshot.current = null; // storage blocked
        }
      }
      return snapshot.current;
    },
    () => null,
  );
  const stored = useMemo(() => parseStored(storedRaw ?? null), [storedRaw]);

  // Offered, never applied silently. The old version overwrote whatever was in
  // the form on mount — which on the edit page meant a stale local copy quietly
  // replacing the saved review, with no way to tell that had happened.
  const offerRestore = stored != null && !restoreHandled;

  // What the slug text alone can tell us, with no round trip.
  const trimmedSlug = v.slug.trim();
  const localSlug: "empty" | "invalid" | "ok" = !trimmedSlug
    ? "empty"
    : /^[a-z0-9]+(-[a-z0-9]+)*$/.test(trimmedSlug)
      ? "ok"
      : "invalid";

  const slugState: SlugState =
    localSlug === "empty"
      ? "unknown"
      : localSlug === "invalid"
        ? "invalid"
        : initial?.slug && trimmedSlug === initial.slug
          ? "free"
          : remoteSlug?.slug === trimmedSlug
            ? remoteSlug.state
            : // debounce window, or a reply for a slug we have since moved past
              "checking";

  function markDirty() {
    dirty.current = true;
    setIsDirty(true);
  }

  function set<K extends keyof ReviewDraft>(k: K, value: ReviewDraft[K]) {
    markDirty();
    setV((prev) => ({ ...prev, [k]: value }));
  }

  /* ── Undo-safe text editing ──
   *
   * Every insertion goes through `execCommand`, not through React state.
   *
   * Writing the whole textarea value back through `setState` — which is what the
   * toolbar and the list handler used to do — replaces the DOM value wholesale
   * and wipes the browser's native undo history. The effect is that Cmd+Z after
   * bolding a word does nothing, or jumps somewhere unrelated. In an editor
   * meant for pieces thousands of words long, that is data loss.
   *
   * `execCommand` is deprecated and still the only API that inserts into a
   * textarea through the browser's own editing pipeline, so undo, redo and the
   * input event all behave. It dispatches `input`, so React's onChange keeps
   * state in sync for free. The state fallback below runs only where it is
   * unavailable — the edit still lands, only undo suffers.
   */
  const applyEdit = useCallback(
    (start: number, end: number, text: string, select?: { start: number; end: number }) => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);

      let ok = false;
      try {
        ok = text
          ? document.execCommand("insertText", false, text)
          : document.execCommand("delete");
      } catch {
        ok = false;
      }

      if (!ok) {
        const next = el.value.slice(0, start) + text + el.value.slice(end);
        dirty.current = true;
        setIsDirty(true);
        setV((prev) => ({ ...prev, content: next }));
      }

      const caret = select ?? { start: start + text.length, end: start + text.length };
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret.start, caret.end);
      });
    },
    [],
  );

  /** Wrap the selection (or a placeholder) in a pair of markers. */
  const wrap = useCallback(
    (before: string, after = before, placeholder = "") => {
      const el = area.current;
      if (!el) return;
      const { selectionStart: s, selectionEnd: e, value } = el;
      const picked = value.slice(s, e) || placeholder;

      // Already wrapped? Unwrap instead, so the button toggles rather than
      // stacking ****bold**** on a second press. Two shapes count as wrapped:
      // the markers just outside the selection (`**|bold|**`), and the markers
      // inside it (`|**bold**|`, what a double-click-drag or Ctrl+A selects).
      const outerStart = s - before.length;
      const outerEnd = e + after.length;
      if (
        outerStart >= 0 &&
        value.slice(outerStart, s) === before &&
        value.slice(e, outerEnd) === after
      ) {
        const inner = value.slice(s, e);
        applyEdit(outerStart, outerEnd, inner, {
          start: outerStart,
          end: outerStart + inner.length,
        });
        return;
      }
      if (
        e - s >= before.length + after.length &&
        value.slice(s, e).startsWith(before) &&
        value.slice(s, e).endsWith(after)
      ) {
        const inner = value.slice(s + before.length, e - after.length);
        applyEdit(s, e, inner, { start: s, end: s + inner.length });
        return;
      }

      applyEdit(s, e, before + picked + after, {
        start: s + before.length,
        end: s + before.length + picked.length,
      });
    },
    [applyEdit],
  );

  /** Insert a block at the caret, on its own line. */
  const block = useCallback(
    (snippet: string) => {
      const el = area.current;
      if (!el) return;
      const { selectionStart: s, value } = el;
      const atLineStart = s === 0 || value[s - 1] === "\n";
      const text = (atLineStart ? "" : "\n") + snippet;
      applyEdit(s, s, text);
    },
    [applyEdit],
  );

  /* ── Image upload ──
   *
   * The flow is placeholder-first: a token goes in at the caret immediately, the
   * upload runs, and the token is then replaced with the real `![alt](url)` —
   * or removed, on failure. Inserting at the *caret's position on completion*
   * instead would land the image mid-sentence for anyone who kept typing while
   * a large file uploaded, which is exactly when it matters.
   */
  const [uploadsInFlight, setUploadsInFlight] = useState(0);
  const uploadSeq = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Replace a placeholder token wherever the author has since moved it. */
  const replaceToken = useCallback(
    (token: string, replacement: string) => {
      const el = area.current;
      if (!el) return;
      const idx = el.value.indexOf(token);
      if (idx === -1) {
        // The author deleted the placeholder mid-upload: that reads as "never
        // mind", so a success is dropped rather than re-inserted somewhere
        // surprising.
        return;
      }
      applyEdit(idx, idx + token.length, replacement);
    },
    [applyEdit],
  );

  /**
   * Upload one file; resolve to its URL and alt text, or null after putting
   * the reason in the error slot. Shared by both writing surfaces — the
   * visual editor inserts the image node itself, the markdown textarea wraps
   * this in its placeholder-token flow below.
   */
  const uploadOne = useCallback(async (file: File): Promise<UploadedImage | null> => {
    if (!file.type.startsWith("image/")) return null;
    if (file.size > 20 * 1024 * 1024) {
      setError(`"${file.name}" is larger than 20 MB.`);
      return null;
    }

    // Alt text starts as the filename — the one hint the author has already
    // typed. Brackets and newlines would break the markdown around it.
    const alt =
      file.name
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[[\]\n\r]/g, " ")
        .trim() || "image";

    setUploadsInFlight((n) => n + 1);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/v1/my/review-images", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? `Uploading "${file.name}" failed — try again.`);
        return null;
      }
      return { url: data.url, alt };
    } catch {
      setError("Network error during upload — your text is untouched, try again.");
      return null;
    } finally {
      setUploadsInFlight((n) => n - 1);
    }
  }, []);

  const uploadImages = useCallback(
    async (files: Iterable<File>) => {
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const token = `![Uploading ${file.name}…](upload-${++uploadSeq.current})`;
        block(`${token}\n\n`);
        const uploaded = await uploadOne(file);
        if (uploaded) replaceToken(token, `![${uploaded.alt}](${uploaded.url})`);
        else replaceToken(token, "");
      }
    },
    [block, replaceToken, uploadOne],
  );

  /* ── Keyboard ── */

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
      e.preventDefault();
      setTab((t) => (t === "preview" ? "write" : "preview"));
      return;
    }

    if (mod && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      const shortcuts: Record<string, () => void> = {
        b: () => wrap("**", "**", "bold"),
        i: () => wrap("*", "*", "italic"),
        k: () => wrap("[", "](https://)", "link text"),
        e: () => wrap("`", "`", "code"),
      };
      if (shortcuts[k]) {
        e.preventDefault();
        shortcuts[k]();
        return;
      }
      if (k === "s") {
        // The browser's Save Page is never what someone writing a review wants.
        e.preventDefault();
        void saveDraftNow();
        return;
      }
    }

    // ── Tab: indent list items, but never steal Tab from keyboard navigation.
    // Tab only indents where indenting is plausibly meant — inside a list item,
    // or across a multi-line selection. Everywhere else it moves focus, which is
    // the behaviour someone tabbing through the form depends on.
    if (e.key === "Tab" && !mod && !e.altKey) {
      const { selectionStart: s, selectionEnd: t, value } = el;
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const lineEnd = value.indexOf("\n", lineStart) === -1 ? value.length : value.indexOf("\n", lineStart);
      const inList = /^\s*([-*+]|\d+\.)\s/.test(value.slice(lineStart, lineEnd));
      const multiline = value.slice(s, t).includes("\n");

      if (!inList && !multiline) return; // let focus move

      e.preventDefault();
      const blockStart = lineStart;
      const nlAfter = value.indexOf("\n", t);
      const blockEnd = nlAfter === -1 ? value.length : nlAfter;
      const lines = value.slice(blockStart, blockEnd).split("\n");
      const shifted = e.shiftKey
        ? lines.map((l) => l.replace(/^ {1,2}/, ""))
        : lines.map((l) => `  ${l}`);
      const next = shifted.join("\n");
      applyEdit(blockStart, blockEnd, next, {
        start: blockStart,
        end: blockStart + next.length,
      });
      return;
    }

    // ── Enter: continue the structure the caret is inside.
    if (e.key === "Enter" && !e.shiftKey && !mod) {
      const upto = el.value.slice(0, el.selectionStart);
      const line = upto.slice(upto.lastIndexOf("\n") + 1);

      // A checkbox is a list item with a box, so it has to be tested first.
      const task = /^(\s*)([-*+])\s+\[[ xX]\]\s+(.*)$/.exec(line);
      const listItem = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
      const quote = /^(\s*)>\s?(.*)$/.exec(line);
      const m = task ?? listItem ?? quote;
      if (!m) return;

      e.preventDefault();
      const at = el.selectionStart;

      const rest = task ? m[3] : listItem ? m[3] : m[2];
      if (rest.trim() === "") {
        // Empty item: end the structure rather than making another one.
        applyEdit(at - line.length, at, "");
        return;
      }

      let insert: string;
      if (task) {
        insert = `\n${m[1]}${m[2]} [ ] `;
      } else if (listItem) {
        const marker = m[2];
        insert = `\n${m[1]}${
          /^\d+\.$/.test(marker) ? `${Number.parseInt(marker, 10) + 1}.` : marker
        } `;
      } else {
        insert = `\n${m[1]}> `;
      }
      applyEdit(at, at, insert);
    }
  }

  /**
   * Pasting a URL over selected text makes a link out of it.
   *
   * This is the one paste anyone does deliberately in a review — dropping a
   * source onto the phrase it supports — and without it the paste destroys the
   * phrase and has to be undone and redone by hand.
   */
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;

    // A pasted image (screenshot, copied picture) uploads directly. Checked
    // before the URL branch: when both are on the clipboard, the file is the
    // deliberate payload.
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (images.length > 0) {
      e.preventDefault();
      void uploadImages(images);
      return;
    }

    const { selectionStart: s, selectionEnd: t } = el;
    if (s === t) return; // nothing selected — a normal paste

    const pasted = e.clipboardData.getData("text/plain").trim();
    if (!/^https?:\/\/\S+$/i.test(pasted) || /\s/.test(pasted)) return;

    e.preventDefault();
    const picked = el.value.slice(s, t);
    const link = `[${picked}](${pasted})`;
    applyEdit(s, t, link, { start: s + 1, end: s + 1 + picked.length });
  }

  /** Dropping image files onto the text uploads them where they landed. */
  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const images = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return; // dropped text — the browser handles it
    e.preventDefault();
    void uploadImages(images);
  }

  /* ── Autosave: this browser first (instant, offline-proof) ── */
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

  /* ── Autosave: then the server, so the draft survives this device ── */
  useEffect(() => {
    if (!dirty.current || !serverDrafts) return;
    // Nothing to attach a draft to until a film is chosen, and no point storing
    // an untouched shell. Returning early rather than setting state here matters:
    // a setState in the effect body re-renders during commit, which re-runs this
    // effect, which is a cascade for no benefit. The label below derives the
    // "local only" case from `v` instead.
    if (!v.movieId || (!v.content.trim() && !v.title.trim())) return;

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

  /* ── Is this slug still free? ──
   *
   * Only the "is it taken" half needs the server, and only that half is state.
   * Empty, malformed and unchanged-from-saved are all decidable from the text in
   * hand, so they are derived during render — putting them in state would mean
   * setting state in this effect's body on every keystroke, re-rendering during
   * commit and re-running the effect.
   *
   * The answer is stored with the slug it answered *for*, so a reply that arrives
   * after the field moved on is ignored instead of mislabelling the new value.
   */
  useEffect(() => {
    const candidate = v.slug.trim();
    if (localSlug !== "ok") return;
    if (initial?.slug && candidate === initial.slug) return;

    const controller = new AbortController();
    const t = window.setTimeout(async () => {
      setRemoteSlug({ slug: candidate, state: "checking" });
      try {
        const params = new URLSearchParams({ slug: candidate });
        const own = reviewId ?? draftId.current;
        if (own) params.set("exclude", own);
        const res = await fetch(`/api/v1/my/slug-check?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setRemoteSlug({ slug: candidate, state: "unknown" });
          return;
        }
        const data = (await res.json()) as { available: boolean; reason: string };
        setRemoteSlug({
          slug: candidate,
          state: data.available ? "free" : data.reason === "invalid" ? "invalid" : "taken",
        });
      } catch {
        // aborted or offline: publishing still checks server-side
        setRemoteSlug({ slug: candidate, state: "unknown" });
      }
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
  }, [v.slug, localSlug, reviewId, initial?.slug]);

  /* ── Guard against losing work ── */
  useEffect(() => {
    function onLeave(e: BeforeUnloadEvent) {
      if (dirty.current) e.preventDefault();
    }
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  /* ── Saving ── */

  // Ctrl+S and the autosave timer share one path, so "saved" always means the
  // same thing.
  async function saveDraftNow() {
    if (!serverDrafts) {
      // No drafts channel here — a published review, or an admin editing
      // someone else's. Ctrl+S still has to mean "save": it goes through the
      // validated API in place, without the navigation the Save button does.
      // It used to silently do nothing, which for a shortcut whose entire job
      // is reassurance is the worst possible behaviour.
      await saveInPlace();
      return;
    }
    if (!v.movieId) return;
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
      setSavedAt(new Date().toLocaleTimeString("en-US", { timeStyle: "short" }));
      setServerState("saved");
    } catch {
      setServerState("local");
    }
  }

  /**
   * Save through the validated API without leaving the page.
   *
   * The API wants the full, valid review (it is the same endpoint the Save
   * button uses), so this checks completeness first and surfaces the problem
   * instead of a bare 400.
   */
  async function saveInPlace() {
    const target = reviewId ?? draftId.current;
    if (!target || busy) return;
    const problem = firstProblem();
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setServerState("saving");
    try {
      const res = await fetch(`${apiBase}/${target}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...v,
          excerpt: v.excerpt || undefined,
          verdict: v.verdict || undefined,
          rating: Number(v.rating),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setServerState("local");
        setError(data.error ?? "Save failed — your text is still in this browser.");
        return;
      }
      dirty.current = false;
      setIsDirty(false);
      setSavedAt(new Date().toLocaleTimeString("en-US", { timeStyle: "short" }));
      setServerState("saved");
      try {
        window.localStorage.removeItem(storeKey);
      } catch {
        /* storage blocked — nothing to clean up */
      }
    } catch {
      setServerState("local");
      setError("Network error — your text is saved in this browser, try again.");
    }
  }

  /** What is missing before this can be published, in the order to fix it. */
  function firstProblem(): string | null {
    if (!v.movieId) return "Pick the film this review is about.";
    if (!v.title.trim()) return "Give the review a title.";
    if (!v.content.trim()) return "The review has no body yet.";
    if (!v.slug.trim()) return "The URL slug is empty.";
    if (slugState === "invalid") {
      return "The URL slug may only contain lowercase letters, numbers and hyphens.";
    }
    if (slugState === "taken") return "That URL slug is already in use — choose another.";
    return null;
  }

  /**
   * The single save path.
   *
   * The intent is an argument, not state. It used to be set by an `onClick` on
   * each submit button — `set("status", "PUBLISHED")` — and read back inside the
   * submit handler. Both handlers run in the same event, before React re-renders,
   * so the submit read the *previous* status: pressing "Publish review" on a new
   * review sent `status: "DRAFT"` and silently filed it as a draft. Passing the
   * intent in removes the race rather than papering over it.
   */
  async function save(intent: "DRAFT" | "PUBLISHED") {
    if (busy) return;
    setError(null);

    if (intent === "PUBLISHED") {
      const problem = firstProblem();
      if (problem) {
        setError(problem);
        return;
      }
    } else if (!v.movieId || !v.title.trim()) {
      setError("A draft needs at least a film and a title.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        ...v,
        status: intent,
        excerpt: v.excerpt || undefined,
        verdict: v.verdict || undefined,
        rating: Number(v.rating),
      };
      // If autosave already created a server draft, publishing updates that row
      // rather than creating a second review.
      const target = reviewId ?? draftId.current;
      const res = await fetch(target ? `${apiBase}/${target}` : apiBase, {
        method: target ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        const detail = (data as { details?: { path?: string; message?: string }[] }).details?.[0];
        setError(
          detail
            ? `${detail.path}: ${detail.message}`
            : ((data as { error?: string }).error ?? "Save failed"),
        );
        return;
      }
      // Only now is the local copy redundant.
      dirty.current = false;
      setIsDirty(false);
      setV((prev) => ({ ...prev, status: intent }));
      try {
        window.localStorage.removeItem(storeKey);
      } catch {
        /* nothing to clean up if storage is blocked */
      }
      router.push(doneHref);
      router.refresh();
    } catch {
      setError("Network error — your draft is saved in this browser, try again.");
    } finally {
      setBusy(false);
    }
  }

  /* ── Derived ── */

  // Preview with the chosen film's real media, so :::trailer and :::still show
  // what the published page will show rather than a placeholder.
  //
  // Looked up in `knownMovies`, not in `movies`: the picker now finds films on
  // the server, so a film chosen from search results was never in the seed list.
  // Before this the preview silently fell back to "This film" with no trailer and
  // no stills for anything the page had not been handed up front.
  const chosen = knownMovies.get(v.movieId);
  const media: ReviewMedia = {
    title: chosen?.title ?? "This film",
    trailerKey: chosen?.trailerKey ?? null,
    stills: chosen?.stills ?? [],
  };
  const words = countWords(v.content);
  const minutes = readingMinutes(v.content);

  const saveLabel = !savedAt
    ? null
    : serverState === "saving"
      ? "saving…"
      : serverState === "saved"
        ? `saved to your account ${savedAt}`
        : !v.movieId
          ? `saved in this browser ${savedAt} — pick a film to sync`
          : `saved in this browser ${savedAt}`;

  const toolGroups: ToolAction[][] = [
    [
      {
        id: "bold",
        label: "Bold",
        hint: `${MOD}+B`,
        glyph: Glyphs.bold,
        run: () => wrap("**", "**", "bold"),
      },
      {
        id: "italic",
        label: "Italic",
        hint: `${MOD}+I`,
        glyph: Glyphs.italic,
        run: () => wrap("*", "*", "italic"),
      },
      {
        id: "strike",
        label: "Strikethrough",
        hint: "~~text~~",
        glyph: Glyphs.strike,
        run: () => wrap("~~", "~~", "struck"),
      },
      {
        id: "highlight",
        label: "Highlight",
        hint: "==text==",
        glyph: Glyphs.highlight,
        run: () => wrap("==", "==", "highlight"),
      },
      {
        id: "code",
        label: "Inline code",
        hint: `${MOD}+E`,
        glyph: Glyphs.code,
        run: () => wrap("`", "`", "code"),
      },
      {
        id: "link",
        label: "Link",
        hint: `${MOD}+K — or paste a URL over a selection`,
        glyph: Glyphs.link,
        run: () => wrap("[", "](https://)", "link text"),
      },
    ],
    [
      {
        id: "h2",
        label: "Section heading",
        hint: "## — becomes a contents entry",
        glyph: Glyphs.heading,
        run: () => block("## Section\n\n"),
      },
      {
        id: "h3",
        label: "Subheading",
        hint: "### — nested under the section above",
        glyph: Glyphs.subheading,
        run: () => block("### Subsection\n\n"),
      },
      {
        id: "quote",
        label: "Pull quote",
        hint: "> — set large as a section beat",
        glyph: Glyphs.quote,
        run: () => block("> A line worth pulling out\n\n"),
      },
      {
        id: "list",
        label: "List",
        hint: "- — Enter continues it, Tab indents",
        glyph: Glyphs.list,
        run: () => block("- point\n- point\n\n"),
      },
      {
        id: "rule",
        label: "Divider",
        hint: "--- — a break between movements",
        glyph: Glyphs.rule,
        run: () => block("---\n\n"),
      },
    ],
    [
      {
        id: "spoiler",
        label: "Spoiler block",
        hint: "hidden until the reader reveals it",
        glyph: Glyphs.spoiler,
        run: () => block(":::spoiler\nWhat happens in the third act…\n:::\n\n"),
      },
      {
        id: "trailer",
        label: "Trailer",
        hint: chosen?.trailerKey
          ? "this film's trailer, inline"
          : chosen
            ? "no trailer on file for this film"
            : "pick a film first",
        glyph: Glyphs.play,
        disabled: !chosen?.trailerKey,
        run: () => block(":::trailer\n\n"),
      },
      {
        id: "still",
        label: "Still",
        hint: media.stills.length
          ? `${media.stills.length} on file — each press inserts the next`
          : chosen
            ? "no stills on file for this film"
            : "pick a film first",
        disabled: media.stills.length === 0,
        glyph: Glyphs.image,
        run: () => {
          // Cycle: the first press inserts still 1, the next still 2… so a
          // review can use the whole set without anyone hand-editing indexes.
          const text = area.current?.value ?? v.content;
          const used = (text.match(/^:::\s*still/gim) ?? []).length;
          block(`:::still ${(used % media.stills.length) + 1}\n\n`);
        },
      },
      {
        id: "upload",
        label: "Upload image",
        hint: "JPEG, PNG, WebP, AVIF or GIF up to 20 MB — or paste / drop one",
        glyph: Glyphs.upload,
        run: () => fileInput.current?.click(),
      },
    ],
  ];

  const slugNote =
    slugState === "taken"
      ? { tone: "text-red-400", text: "Already in use — pick another." }
      : slugState === "invalid"
        ? { tone: "text-red-400", text: "Lowercase letters, numbers and hyphens only." }
        : slugState === "checking"
          ? { tone: "text-muted", text: "Checking…" }
          : slugState === "free"
            ? { tone: "text-positive", text: "Available." }
            : null;

  return (
    // Not a submit-driven form: the two save buttons mean different things and
    // the intent is passed explicitly. `noValidate` is absent because the native
    // `required`/`pattern` hints still help, but validation runs in `save`.
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      {offerRestore && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent-dim bg-accent/10 px-4 py-2.5 text-sm">
          <span>
            An unsaved draft from this browser is available
            {stored?.at ? ` (${new Date(stored.at).toLocaleString("en-US")})` : ""}.
          </span>
          <button
            type="button"
            onClick={() => {
              setV(stored!.draft);
              setSlugTouched(Boolean(stored!.draft.slug));
              setRestoreHandled(true);
              markDirty();
            }}
            className="font-semibold text-accent underline underline-offset-2"
          >
            Restore it
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                window.localStorage.removeItem(storeKey);
              } catch {
                /* nothing to remove */
              }
              setRestoreHandled(true);
            }}
            className="text-muted underline underline-offset-2 hover:text-foreground"
          >
            Discard it
          </button>
        </div>
      )}

      {/* ── The film and the score ── */}
      <fieldset className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <legend className={legend}>The film and your score</legend>
        <div>
          <span className="text-sm text-muted">Film</span>
          <div className="mt-1">
            <MoviePicker
              initial={movies}
              value={v.movieId}
              selected={knownMovies.get(v.movieId) ?? null}
              onChange={(m) => {
                // Remember it before selecting it, so the preview has its media
                // on the same render.
                setKnownMovies((prev) => new Map(prev).set(m.id, m));
                set("movieId", m.id);
              }}
            />
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
            Shown above the review, next to your score, and quoted in search results. Leave it
            blank and we&apos;ll phrase one from the rating.
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
              maxLength={120}
              value={v.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
              aria-invalid={slugState === "taken" || slugState === "invalid"}
              className={`${input} font-mono ${
                slugState === "taken" || slugState === "invalid" ? "border-red-400/60" : ""
              }`}
            />
            <span className={`mt-1 block h-4 text-xs ${slugNote?.tone ?? "text-muted"}`}>
              {slugNote?.text ?? ""}
            </span>
          </label>
        </div>
      </fieldset>

      {/* ── The review itself ── */}
      <fieldset className="rounded-xl border border-line bg-surface p-5">
        <legend className={legend}>The review</legend>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <div className="mr-auto flex gap-1.5 rounded-lg border border-line p-0.5">
            {(["write", "markdown", "split", "preview"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                title={
                  t === "write"
                    ? "Visual editor — formatting stays formatting"
                    : t === "markdown"
                      ? "The same review as markdown source"
                      : t === "split"
                        ? "Source and result side by side"
                        : `${t} — ${MOD}+Shift+P toggles`
                }
                // Split needs the width for two columns; on a phone the tabs are
                // the whole interface.
                className={`rounded px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                  tab === t ? "bg-accent text-black" : "text-muted hover:text-foreground"
                } ${t === "split" ? "hidden lg:block" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="font-mono text-[11px] text-muted">
            {words.toLocaleString("en-US")} words · {minutes} min read
            {uploadsInFlight > 0 && (
              <span className="ml-2 text-accent">
                uploading {uploadsInFlight} image{uploadsInFlight > 1 ? "s" : ""}…
              </span>
            )}
            {saveLabel && <span className="ml-2 text-accent/80">{saveLabel}</span>}
            {!saveLabel && isDirty && <span className="ml-2">unsaved</span>}
          </span>
        </div>

        {tab === "write" && (
          <div className="mt-3">
            <RichEditor
              value={v.content}
              onChange={(md) => set("content", md)}
              onSaveShortcut={() => void saveDraftNow()}
              uploadImage={uploadOne}
              media={{ trailerKey: chosen?.trailerKey ?? null, stills: media.stills }}
            />
          </div>
        )}

        {(tab === "markdown" || tab === "split") ? (
          <>
            <div className="mt-3">
              <EditorToolbar groups={toolGroups} />
              {/* Behind the toolbar's Upload button. Value is reset after each
                  pick so choosing the same file twice fires change twice. */}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void uploadImages(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
            </div>

            <div
              className={
                tab === "split"
                  ? "mt-3 grid gap-4 lg:grid-cols-2 lg:items-start"
                  : "mt-3"
              }
            >
            <textarea
              ref={area}
              rows={22}
              value={v.content}
              onChange={(e) => set("content", e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onDrop={onDrop}
              onDragOver={(e) => {
                // Without this the browser navigates to the dropped file.
                if (e.dataTransfer.types.includes("Files")) e.preventDefault();
              }}
              spellCheck
              placeholder={
                "## Space is class\n\nIn *Parasite* the camera never stops moving vertically…\n\n> The film never explains class through dialogue. You feel it.\n\n:::trailer\n\n:::spoiler\nThe basement reveal changes everything about the first hour.\n:::"
              }
              className={`${input} mt-0 font-mono leading-relaxed`}
            />

            {tab === "split" && (
              <div
                aria-live="off"
                className="max-h-[36rem] overflow-y-auto rounded-lg border border-line bg-background p-5"
              >
                {v.content.trim() ? (
                  <ReviewBody content={v.content} media={media} />
                ) : (
                  <p className="text-sm text-muted">
                    The rendered review appears here as you type.
                  </p>
                )}
              </div>
            )}
            </div>

            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer">Formatting reference</summary>
              <ul className="mt-2 space-y-1 font-mono">
                <li>
                  {MOD}+B bold · +I italic · +E code · +K link · +S save draft · +Shift+P preview
                </li>
                <li>Enter continues a list, a numbered list, a checklist or a quote</li>
                <li>Tab / Shift+Tab indents a list item</li>
                <li>Paste a URL over selected text to link it</li>
                <li>Paste or drop an image file to upload it — ![alt](url) is inserted</li>
                <li>## Section · ### Subsection — become the table of contents</li>
                <li>&gt; line — a pull quote, set large</li>
                <li>==text== highlight · ~~text~~ strikethrough · `code`</li>
                <li>- [ ] task — a checklist item</li>
                <li>:::spoiler … ::: — hidden until the reader reveals it</li>
                <li>:::trailer — the film&apos;s trailer, inline</li>
                <li>:::still 2 — still #2 from the film</li>
              </ul>
            </details>
          </>
        ) : tab === "preview" ? (
          <div className="mt-4 rounded-lg border border-line bg-background p-5">
            {v.content.trim() ? (
              <ReviewBody content={v.content} media={media} />
            ) : (
              <p className="text-sm text-muted">Nothing to preview yet.</p>
            )}
            <p className="mt-6 border-t border-line pt-3 text-xs text-muted">
              {chosen
                ? `Trailers and stills are rendered with ${chosen.title}'s own media.`
                : "Pick a film and trailers and stills will render with its real media."}
            </p>
          </div>
        ) : null}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !canPublish}
          onClick={() => void save("PUBLISHED")}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : v.status === "PUBLISHED" ? "Save changes" : "Publish review"}
        </button>
        {!canPublish && (
          <Link href="/me/settings" className="text-sm text-accent hover:opacity-80">
            Add your writer biography before publishing →
          </Link>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void save("DRAFT")}
          className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:border-accent-dim disabled:opacity-50"
        >
          {v.status === "PUBLISHED" ? "Unpublish to draft" : "Save as draft"}
        </button>
        <button
          type="button"
          onClick={() => {
            dirty.current = false;
            setIsDirty(false);
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
