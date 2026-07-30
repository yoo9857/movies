"use client";

// Converts the profile paths we already hold into portraits we own, a batch at
// a time, looping until none are left. Progress is shown as it goes because the
// whole run is minutes of image work and a spinner with no numbers is
// indistinguishable from a hang.
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Batch {
  imported: string[];
  failed: { name: string; reason: string }[];
  remaining: number;
  needResearch: number;
}

export function ImportPortraitsButton({ pending }: { pending: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [failures, setFailures] = useState<{ name: string; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<Batch | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setFailures([]);
    setDone(0);
    setFinished(null);
    try {
      // Bounded loop: one batch per request, stop when the server says none
      // remain. The guard is a backstop against a batch that never drains.
      for (let round = 0; round < 60; round++) {
        const res = await fetch("/api/v1/admin/people/photos/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 10 }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? `Import failed (${res.status})`);
          return;
        }
        const batch = (await res.json()) as Batch;
        setDone((n) => n + batch.imported.length);
        if (batch.failed.length) setFailures((f) => [...f, ...batch.failed]);
        if (batch.remaining === 0) {
          setFinished(batch);
          break;
        }
      }
      router.refresh();
    } catch {
      setError("Network error during import.");
    } finally {
      setBusy(false);
    }
  }

  if (pending === 0 && !finished && !busy) return null;

  return (
    <div className="rounded-xl border border-accent-dim bg-accent/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto text-sm">
          <p className="font-semibold">
            {pending} portrait{pending === 1 ? "" : "s"} can be imported
          </p>
          <p className="text-xs text-muted">
            Fetched once, re-encoded, and stored as our own objects — after this the
            page no longer depends on the source staying up.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? `Importing… ${done}` : "Import them"}
        </button>
      </div>

      {finished && (
        <p className="mt-3 text-xs text-muted">
          Imported {done}. {finished.needResearch} people have no source photo anywhere —
          those are ours to research and upload.
        </p>
      )}
      {failures.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-red-400">
          {failures.slice(0, 8).map((f) => (
            <li key={f.name}>
              {f.name}: {f.reason}
            </li>
          ))}
          {failures.length > 8 && <li>…and {failures.length - 8} more</li>}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
