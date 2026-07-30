"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteTopicButton({
  topicId,
  name,
  filmCount,
}: {
  topicId: string;
  name: string;
  /** Named in the confirmation, because deleting takes the notes with it. */
  filmCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    const notes =
      filmCount > 0
        ? ` Its ${filmCount} film assignment${filmCount === 1 ? "" : "s"} and the notes written for them go too.`
        : "";
    if (!window.confirm(`Delete the topic "${name}"?${notes}`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/topics/${topicId}`, { method: "DELETE" });
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
