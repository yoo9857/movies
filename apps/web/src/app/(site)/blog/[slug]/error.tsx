"use client";

/**
 * The piece survives its own footer.
 *
 * "What else to read" streams in after the article, behind a Suspense
 * boundary — and without a boundary of its own, a failure in either of those
 * two queries discards the article that has already reached the reader and
 * replaces it with the site-wide error screen. For navigation. This keeps the
 * blast radius where it belongs.
 */
import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl py-16 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">Off Camera</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">This piece did not load</h1>
      <p className="mt-3 text-muted">
        Something went wrong on our side. The piece itself is fine.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
        >
          Try again
        </button>
        <Link
          href="/blog"
          className="rounded-lg border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
        >
          Back to the blog
        </Link>
      </div>
    </div>
  );
}
