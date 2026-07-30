"use client";

// Portrait work for one person: upload a file we found, paste a URL we found,
// or clear it back to the monogram. Every path ends in an object on our own
// storage — the URL case is fetched and re-encoded server-side, never written
// through as a link.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function PersonPhotoManager({
  personId,
  hasImage,
}: {
  personId: string;
  hasImage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const file = useRef<HTMLInputElement>(null);

  async function send(init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/people/${personId}/photo`, init);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setUrl("");
      router.refresh();
    } catch {
      setError("Network error — nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => file.current?.click()}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent-dim disabled:opacity-50"
        >
          {busy ? "Working…" : "Upload file"}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            const body = new FormData();
            body.append("file", picked);
            void send({ method: "POST", body });
          }}
        />
        {hasImage && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void send({ method: "DELETE" })}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-surface disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!url.trim()) return;
          void send({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url.trim() }),
          });
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="…or paste an https:// image URL"
          className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-1.5 text-xs outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent-dim disabled:opacity-40"
        >
          Fetch
        </button>
      </form>

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
