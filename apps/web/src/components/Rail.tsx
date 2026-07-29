"use client";

// Horizontal rail with desktop arrow controls. Touch/trackpad scrolling still
// works untouched; the arrows exist because a mouse has no swipe.
import { useCallback, useEffect, useRef, useState } from "react";

export function Rail({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    sync();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [sync]);

  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.8), behavior: "smooth" });
  };

  const arrow =
    "grid h-8 w-8 place-items-center rounded-full border border-line bg-surface/80 text-muted backdrop-blur transition-colors hover:border-accent-dim hover:text-foreground disabled:pointer-events-none disabled:opacity-25";

  return (
    <section className={className}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          <span className="cx-reel-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {action}
          <div className="hidden gap-1.5 sm:flex">
            <button onClick={() => nudge(-1)} disabled={atStart} aria-label="Scroll left" className={arrow}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button onClick={() => nudge(1)} disabled={atEnd} aria-label="Scroll right" className={arrow}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div ref={ref} className="cx-rail mt-4">
        {children}
      </div>
    </section>
  );
}
