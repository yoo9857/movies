"use client";

// Root segment boundary — renders inside the root layout. The true last resort
// (a throw in the layout itself) is global-error.tsx. `unstable_retry` rather
// than `reset`: retry re-fetches, which is the only recovery that helps when
// the throw was a database hiccup, and that is what most throws here are.
export default function RootError({
  unstable_retry,
}: {
  error: Error;
  unstable_retry: () => void;
}) {
  // intentionally not rendering error details — no internals leak to visitors
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">500</p>
      <h1 className="mt-2 text-3xl font-bold">Projector malfunction</h1>
      <p className="mt-3 max-w-md text-muted">
        Something went wrong on our side. Give it another try.
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
