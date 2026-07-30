"use client";

// Run the whole library through Wikipedia, a batch at a time.
//
// The skipped list is the point of the interface, not an error report: those are
// the people whose identity needs a human, and hiding them would turn "we could
// not tell" into "there was nothing there".
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Batch {
  linked: { name: string; article: string; photo: boolean }[];
  skipped: { name: string; reason: string }[];
  remaining: number;
}

export function EnrichAllButton({ pending }: { pending: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState<Batch["linked"]>([]);
  const [skipped, setSkipped] = useState<Batch["skipped"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setLinked([]);
    setSkipped([]);
    setDone(false);
    try {
      for (let round = 0; round < 40; round++) {
        const res = await fetch("/api/v1/admin/people/enrich-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 8 }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? `Failed (${res.status})`);
          return;
        }
        const batch = (await res.json()) as Batch;
        setLinked((l) => [...l, ...batch.linked]);
        setSkipped((s) => [...s, ...batch.skipped]);
        if (batch.remaining === 0) break;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Network error during enrichment.");
    } finally {
      setBusy(false);
    }
  }

  if (pending === 0 && !done && !busy) return null;

  return (
    <div className="rounded-xl border border-accent-dim bg-accent/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto text-sm">
          <p className="font-semibold">
            {pending} {pending === 1 ? "person has" : "people have"} no Wikipedia link
          </p>
          <p className="text-xs text-muted">
            Only matches it can defend are committed — the article title must be the name, and
            Wikipedia&apos;s own description must place them in film. Everything else is listed for
            you to settle in the picker.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? `Looking up… ${linked.length}` : "Look them up"}
        </button>
      </div>

      {(linked.length > 0 || skipped.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-positive">
              Linked · {linked.length}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
              {linked.slice(-14).map((l) => (
                <li key={l.name} className="truncate">
                  {l.name}
                  {l.photo && <span className="text-accent"> · photo</span>}
                </li>
              ))}
              {linked.length > 14 && <li>…and {linked.length - 14} more</li>}
            </ul>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Needs you · {skipped.length}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
              {skipped.slice(0, 14).map((s) => (
                <li key={s.name}>
                  <span className="text-foreground">{s.name}</span> — {s.reason}
                </li>
              ))}
              {skipped.length > 14 && <li>…and {skipped.length - 14} more</li>}
            </ul>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
