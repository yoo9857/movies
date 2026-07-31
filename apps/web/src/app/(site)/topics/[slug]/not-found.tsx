import Link from "next/link";

/** A topic that was never written, or was retired. */
export default function TopicNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold">No such shelf</h1>
      <p className="mt-3 max-w-md text-muted">
        This topic doesn&apos;t exist — it may have been renamed or retired. The ones that do
        are all listed.
      </p>
      <Link
        href="/topics"
        className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
      >
        All topics
      </Link>
    </main>
  );
}
