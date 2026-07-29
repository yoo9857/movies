"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar } from "./Avatar";

/**
 * Pick a picture, see it immediately, keep the old one if anything fails.
 *
 * The preview is a local object URL so the change feels instant; the server's
 * URL replaces it once the upload lands, because the server's copy is the one
 * that has been stripped of EXIF and re-encoded.
 */
export function AvatarUpload({
  current,
  name,
}: {
  current: string | null;
  name: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState<string | null>(current);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function upload(file: File) {
    const local = URL.createObjectURL(file);
    setPreview(local);
    setBusy(true);
    setNote(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/v1/my/avatar", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPreview(null);
        setNote(data?.error ?? "Upload failed");
        return;
      }
      setShown(data.avatarUrl);
      setNote("Saved");
      router.refresh();
    } catch {
      setPreview(null);
      setNote("Network error — try again");
    } finally {
      setBusy(false);
      URL.revokeObjectURL(local);
      setPreview(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/v1/my/avatar", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setNote(data?.error ?? "Could not remove it");
        return;
      }
      setShown(null);
      setNote("Removed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: URL cannot go through the optimiser
        <img
          src={preview}
          alt=""
          className="h-16 w-16 shrink-0 rounded-full object-cover opacity-70"
        />
      ) : (
        <Avatar src={shown} name={name} size={64} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-lg border border-line px-4 py-2 text-sm font-semibold transition-colors hover:border-accent-dim disabled:opacity-50"
        >
          {busy ? "Uploading…" : shown ? "Change picture" : "Upload a picture"}
        </button>
        {shown && !busy && (
          <button
            type="button"
            onClick={remove}
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            Remove
          </button>
        )}
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
    </div>
  );
}
