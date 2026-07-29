"use client";

// The toolbar. Grouped by what each control does to the text, labelled for
// screen readers, and every item shows its keyboard shortcut in the tooltip —
// the shortcuts are the primary interface for anyone writing at length.
export interface ToolAction {
  id: string;
  label: string;
  hint: string;
  glyph: React.ReactNode;
  run: () => void;
}

export function EditorToolbar({ groups }: { groups: ToolAction[][] }) {
  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-background p-1"
      role="toolbar"
      aria-label="Formatting"
    >
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center gap-1">
          {gi > 0 && <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />}
          {group.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={t.run}
              title={`${t.label} — ${t.hint}`}
              aria-label={`${t.label} (${t.hint})`}
              className="grid h-8 min-w-8 place-items-center rounded px-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              {t.glyph}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Small monospace label used where an icon would be less clear than a word. */
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-wide">{children}</span>;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Glyphs = {
  bold: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...stroke}>
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  ),
  italic: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...stroke}>
      <path d="M15 5h-5M14 19H9M14.5 5l-4 14" />
    </svg>
  ),
  heading: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...stroke}>
      <path d="M6 5v14M16 5v14M6 12h10" />
    </svg>
  ),
  quote: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" stroke="none">
      <path d="M7 7h4v6a4 4 0 0 1-4 4v-2a2 2 0 0 0 2-2H7zM15 7h4v6a4 4 0 0 1-4 4v-2a2 2 0 0 0 2-2h-2z" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...stroke}>
      <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...stroke}>
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </svg>
  ),
  highlight: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...stroke}>
      <path d="M4 20h16" />
      <path d="M8 15l7.5-7.5a2 2 0 0 1 3 3L11 18H8z" />
    </svg>
  ),
  spoiler: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" stroke="none">
      <path d="M2 5.3 3.3 4l16.7 16.7-1.3 1.3-3-3A10.6 10.6 0 0 1 12 19.5c-5 0-9-4-10.5-7.5A15 15 0 0 1 5.6 8.9L2 5.3zM12 8.5a3.5 3.5 0 0 1 3.5 3.5c0 .5-.1 1-.3 1.4l-4.6-4.6c.4-.2.9-.3 1.4-.3z" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" stroke="none">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...stroke}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 15l4.5-4.5 3.5 3.5 3-3L21 16" />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
};
