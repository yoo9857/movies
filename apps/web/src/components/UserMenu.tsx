"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function UserMenu({
  username,
  displayName,
  isAdmin,
}: {
  username: string;
  displayName: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function signOut() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent-dim"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-black">
          {(displayName ?? username).charAt(0).toUpperCase()}
        </span>
        <span className="max-w-24 truncate">{displayName ?? username}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-lg border border-line bg-surface-raised py-1 text-sm shadow-xl">
          <Link
            href="/me/reviews"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 hover:bg-surface"
          >
            My reviews
          </Link>
          <Link
            href="/write"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 hover:bg-surface"
          >
            Write a review
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 hover:bg-surface"
            >
              Admin
            </Link>
          )}
          <button
            onClick={signOut}
            className="block w-full px-4 py-2 text-left text-muted hover:bg-surface"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
