import { SectionHead } from "./ReelDivider";
// Budget vs revenue — two bars, one scale, no distortion. Full-bleed band.
function money(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
}

export function BoxOfficeBand({
  budget,
  revenue,
}: {
  budget: number | null;
  revenue: number | null;
}) {
  if (!budget && !revenue) return null;
  const max = Math.max(budget ?? 0, revenue ?? 0);
  const roi = budget && revenue ? revenue / budget : null;

  const rows: { label: string; value: number | null; color: string }[] = [
    { label: "Budget", value: budget, color: "var(--chart-alt)" },
    { label: "Revenue", value: revenue, color: "var(--chart-fandom)" },
  ];

  return (
    <section className="border-y border-line py-6" aria-label="Box office">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHead>
          Box office <span className="normal-case tracking-normal">· USD, worldwide</span>
        </SectionHead>
        {roi != null && (
          <p className="text-2xl font-bold leading-none tabular-nums">
            ×{roi >= 10 ? roi.toFixed(1) : roi.toFixed(2)}
            <span className="ml-2 text-xs font-normal text-muted">return on budget</span>
          </p>
        )}
      </div>
      <div className="mt-4 space-y-3">
        {rows.map(
          (r) =>
            r.value != null && (
              <div key={r.label} className="grid grid-cols-[5rem_1fr_5.5rem] items-center gap-3">
                <span className="font-mono text-xs text-muted">{r.label}</span>
                <div className="h-4 overflow-hidden rounded-r" style={{ background: "var(--surface-raised)" }}>
                  <div
                    className="h-full rounded-r"
                    style={{
                      width: `${Math.max(1.5, (r.value / max) * 100)}%`,
                      background: r.color,
                    }}
                  />
                </div>
                <span className="text-right font-mono text-sm tabular-nums">{money(r.value)}</span>
              </div>
            ),
        )}
      </div>
    </section>
  );
}
