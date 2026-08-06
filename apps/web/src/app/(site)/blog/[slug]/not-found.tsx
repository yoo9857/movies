import Link from "next/link";

/** A post that was never published, or was withdrawn. */
export default function PostNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold">No such piece</h1>
      <p className="mt-3 max-w-md text-muted">
        This post doesn&apos;t exist — it may still be a draft, or it may have been withdrawn.
        Everything we have published is on the blog.
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
