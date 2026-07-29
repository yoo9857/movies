"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="rounded border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent-dim hover:text-foreground"
    >
      Sign out
    </button>
  );
}
