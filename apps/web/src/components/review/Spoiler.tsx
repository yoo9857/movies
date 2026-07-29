"use client";

// A spoiler region stays covered until the reader asks for it. Content is
// rendered but visually and semantically hidden, so nothing is spoiled by
// accident — including by a screen reader racing ahead.
import { useState } from "react";

export function Spoiler({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-6 overflow-hidden rounded-xl border border-chart-alt/40">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-chart-alt/10 px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.14em] text-chart-alt transition-colors hover:bg-chart-alt/15"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor">
          {open ? (
            <path d="M12 6.5c-4.5 0-8 3.5-9.5 5.5C4 14 7.5 17.5 12 17.5s8-3.5 9.5-5.5C20 10 16.5 6.5 12 6.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
          ) : (
            <path d="M2 5.3 3.3 4l16.7 16.7-1.3 1.3-3-3A10.6 10.6 0 0 1 12 19.5c-5 0-9-4-10.5-7.5A15 15 0 0 1 5.6 8.9L2 5.3zM12 8.5a3.5 3.5 0 0 1 3.5 3.5c0 .5-.1 1-.3 1.4l-4.6-4.6c.4-.2.9-.3 1.4-.3z" />
          )}
        </svg>
        {open ? "Spoiler shown — click to hide" : "Spoiler hidden — click to reveal"}
      </button>
      <div
        hidden={!open}
        className="px-4 pb-1 pt-2"
        // margins inside are handled by the prose styles
      >
        {children}
      </div>
    </div>
  );
}
