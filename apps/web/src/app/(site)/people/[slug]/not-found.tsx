import Link from "next/link";

/** Nobody by that name in the credits. */
export default function PersonNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold">Not in the credits</h1>
      <p className="mt-3 max-w-md text-muted">
        No one in the library answers to this address. Try the people index, or search by
        name.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/people"
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
        >
          Browse people
        </Link>
        <Link
          href="/search"
          className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:border-accent-dim"
        >
          Search instead
        </Link>
      </div>
    </main>
  );
}
