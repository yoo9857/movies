"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function HelpfulButton({
  slug,
  count,
  voted,
  canVote,
}: {
  slug: string;
  count: number;
  voted: boolean;
  canVote: boolean;
}) {
  const router = useRouter();
  // optimistic local state; the server remains the source of truth on refresh
  const [state, setState] = useState({ count, voted });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function toggle() {
    if (!canVote) {
      setNote("Sign in to mark reviews helpful.");
      return;
    }
    setBusy(true);
    setNote(null);
    const next = !state.voted;
    setState((s) => ({ count: s.count + (next ? 1 : -1), voted: next }));
    try {
      const res = await fetch(`/api/v1/reviews/${slug}/helpful`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setState({ count, voted }); // roll back
        const data = await res.json().catch(() => null);
        setNote(data?.error ?? "Could not record that.");
        return;
      }
      const data = await res.json();
      setState({ count: data.helpfulCount, voted: data.voted });
      router.refresh();
    } catch {
      setState({ count, voted });
      setNote("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={state.voted}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-60 ${
          state.voted
            ? "border-accent bg-accent/15 text-accent"
            : "border-line text-muted hover:border-accent-dim hover:text-foreground"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M2 21h4V9H2v12zM23 10a2 2 0 0 0-2-2h-6.3l1-4.6v-.3a1.5 1.5 0 0 0-.44-1.06L14.2 1 7.6 7.6A2 2 0 0 0 7 9v10a2 2 0 0 0 2 2h9a2 2 0 0 0 1.84-1.22l3-7A2 2 0 0 0 23 12v-2z" />
        </svg>
        {state.voted ? "Marked helpful" : "This was helpful"}
        <span className="font-mono tabular-nums">{state.count}</span>
      </button>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}
