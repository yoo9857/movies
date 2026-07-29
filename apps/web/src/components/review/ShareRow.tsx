"use client";

// Share without third-party scripts: plain intent URLs plus a clipboard copy.
// Nothing here phones home on render.
import { useState } from "react";

export function ShareRow({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const targets = [
    { label: "X", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { label: "Threads", href: `https://www.threads.net/intent/post?text=${encodeURIComponent(`${title} ${url}`)}` },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const cls =
    "rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted transition-colors hover:border-accent-dim hover:text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Share
      </span>
      <button onClick={copy} className={cls}>
        {copied ? "Link copied" : "Copy link"}
      </button>
      {targets.map((t) => (
        <a key={t.label} href={t.href} target="_blank" rel="noopener noreferrer" className={cls}>
          {t.label}
        </a>
      ))}
    </div>
  );
}
