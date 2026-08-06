import Link from "next/link";

/** A shelf that does not exist — the five are a fixed list. */
export default function ShelfNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold">No such shelf</h1>
      <p className="mt-3 max-w-md text-muted">
        The blog has five shelves and this is not one of them. They are all listed on the
        front.
      </p>
      <Link
        href="/blog"
        className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
      >
        The blog
      </Link>
    </main>
  );
}
