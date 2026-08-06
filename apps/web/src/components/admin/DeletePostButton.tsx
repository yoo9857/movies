"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeletePostButton({
  postId,
  title,
  published,
}: {
  postId: string;
  title: string;
  /** Named in the confirmation: deleting a live post breaks a URL people hold. */
  published: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    const warning = published
      ? " It is published, so its URL stops resolving and anything linking to it breaks."
      : "";
    if (!window.confirm(`Delete "${title}"?${warning}`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/posts/${postId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
      else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        window.alert(data?.error ?? "Delete failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
    >
      {busy ? "…" : "Delete"}
    </button>
  );
}
