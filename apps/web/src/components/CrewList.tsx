// Hairline definition list — no boxes, credits-roll discipline.
import Link from "next/link";

export interface CrewEntry {
  id: string;
  name: string;
  job: string;
  /** Set once the credit is linked to a Person; makes the name a link. */
  person?: { slug: string } | null;
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
  const byJob = new Map<string, CrewEntry[]>();
  for (const c of sorted) {
    byJob.set(c.job, [...(byJob.get(c.job) ?? []), c]);
  }

  const jobRows = Array.from(byJob, ([job, names]) => ({ label: job, names }));
  if (jobRows.length === 0 && extra.length === 0) return null;

  return (
    <dl>
      {jobRows.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 first:border-t"
        >
          <dt className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            {r.label}
          </dt>
          <dd className="text-right text-sm">
            {r.names.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                {c.person ? (
                  <Link
                    href={`/people/${c.person.slug}`}
                    className="transition-colors hover:text-accent"
                  >
                    {c.name}
                  </Link>
                ) : (
                  c.name
                )}
              </span>
            ))}
          </dd>
        </div>
      ))}
      {extra.map((r) => (
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
