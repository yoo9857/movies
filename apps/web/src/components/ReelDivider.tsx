// Section rule drawn as a strip of film perforations — the house divider.
export function ReelDivider({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`cx-perf ${className}`} />;
}

// Section heading with the logo's reel dots as its marker.
export function SectionHead({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        <span className="cx-reel-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {children}
      </h2>
      {action}
    </div>
  );
}
