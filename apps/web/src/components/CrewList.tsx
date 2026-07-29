// Hairline definition list — no boxes, credits-roll discipline.
export interface CrewEntry {
  id: string;
  name: string;
  job: string;
}

const JOB_ORDER = [
  "Director",
  "Screenplay",
  "Writer",
  "Director of Photography",
  "Original Music Composer",
  "Editor",
  "Production Design",
];

export function CrewList({
  crew,
  extra = [],
}: {
  crew: CrewEntry[];
  extra?: { label: string; value: string }[];
}) {
  const sorted = [...crew].sort(
    (a, b) => JOB_ORDER.indexOf(a.job) - JOB_ORDER.indexOf(b.job),
  );
  // merge same-job names (e.g. two writers)
  const byJob = new Map<string, string[]>();
  for (const c of sorted) {
    byJob.set(c.job, [...(byJob.get(c.job) ?? []), c.name]);
  }

  const rows: { label: string; value: string }[] = [
    ...Array.from(byJob, ([job, names]) => ({ label: job, value: names.join(", ") })),
    ...extra,
  ];
  if (rows.length === 0) return null;

  return (
    <dl>
      {rows.map((r) => (
        <div
          key={r.label + r.value}
          className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 first:border-t"
        >
          <dt className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            {r.label}
          </dt>
          <dd className="text-right text-sm">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
