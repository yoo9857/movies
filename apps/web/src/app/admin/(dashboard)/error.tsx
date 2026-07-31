"use client";

/**
 * Admin failures answer in admin terms. Without this, a throw on any desk page
 * bubbled to the site's boundary and dressed a broken dashboard as a broken
 * cinema — same recovery, wrong room.
 */
export default function AdminError({
  unstable_retry,
}: {
  error: Error;
  unstable_retry: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">500</p>
      <h1 className="mt-2 text-2xl font-bold">The desk hit an error</h1>
      <p className="mt-3 max-w-md text-muted">
        The page failed while loading. Your data is fine — retry, and if it keeps failing,
        check the server logs.
      </p>
      <button
        onClick={() => unstable_retry()}
        className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
