"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const inputCls =
  "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login" ? { email, password } : { email, username, password },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.details?.[0];
        setError(detail ? `${detail.path}: ${detail.message}` : (data.error ?? "Request failed"));
        return;
      }
      router.push(data.user?.role === "ADMIN" ? "/admin" : "/");
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-sm rounded-xl border border-line bg-surface p-6"
    >
      <h1 className="text-xl font-bold">
        {mode === "login" ? "Welcome back" : "Join the fandom"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "login"
          ? "Sign in to write reviews and rate films."
          : "Create an account to publish your own reviews."}
      </p>

      <label className="mt-6 block text-sm">
        <span className="text-muted">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </label>

      {mode === "register" && (
        <label className="mt-4 block text-sm">
          <span className="text-muted">Username</span>
          <input
            required
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9_]+"
            title="lowercase letters, numbers and underscores"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputCls}
          />
        </label>
      )}

      <label className="mt-4 block text-sm">
        <span className="text-muted">Password{mode === "register" ? " (12+ characters)" : ""}</span>
        <input
          type="password"
          required
          minLength={mode === "register" ? 12 : 1}
          maxLength={128}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
      </label>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
      </button>

      <p className="mt-4 text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/register" className="text-accent hover:opacity-80">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already a member?{" "}
            <Link href="/login" className="text-accent hover:opacity-80">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
