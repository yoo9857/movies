import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold">Scene missing</h1>
      <p className="mt-3 max-w-md text-muted">
        This reel seems to have been lost in the archive. The page you&apos;re looking for
        doesn&apos;t exist or was moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
      >
        Back to CinePixo
      </Link>
    </main>
  );
}
