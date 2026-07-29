"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteReviewButton({ reviewId, title }: { reviewId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/reviews/${reviewId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
      else {
        const data = await res.json().catch(() => null);
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
