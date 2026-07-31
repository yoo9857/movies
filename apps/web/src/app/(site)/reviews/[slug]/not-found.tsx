import Link from "next/link";

/** A review link with nothing behind it — unpublished, deleted, or mistyped. */
export default function ReviewNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold">This review isn&apos;t showing</h1>
      <p className="mt-3 max-w-md text-muted">
        It may have been unpublished by its author, or the link is wrong. The rest of the
        criticism is still on.
      </p>
      <Link
        href="/reviews"
        className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
      >
        All reviews
      </Link>
    </main>
  );
}
