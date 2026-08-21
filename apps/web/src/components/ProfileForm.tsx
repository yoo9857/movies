"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileForm({
  displayName,
  bio,
}: {
  displayName: string | null;
  bio: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName ?? "");
  const [about, setAbout] = useState(bio ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/v1/my/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, bio: about }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: { path?: string; message?: string }[];
      };
      if (!res.ok) {
        const detail = data.details?.[0];
        setNote(detail ? `${detail.path}: ${detail.message}` : (data.error ?? "Save failed"));
        return;
      }
      setNote("Saved");
      router.refresh();
    } catch {
      setNote("Network error — nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-muted">Public name</span>
        <input
          value={name}
          maxLength={50}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
          placeholder="Name shown on your byline"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted">Writer biography</span>
        <textarea
          value={about}
          rows={5}
          maxLength={600}
          onChange={(event) => setAbout(event.target.value)}
          className={inputClass}
          placeholder="Your film background, areas of focus and relevant experience."
        />
        <span className="mt-1 block text-xs text-muted">
          Required before publishing. This appears on your public writer page and byline.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save profile"}
        </button>
        {note && <span role="status" className="text-xs text-muted">{note}</span>}
      </div>
    </div>
  );
}
