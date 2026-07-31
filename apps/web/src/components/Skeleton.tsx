/**
 * Loading placeholders in the house style.
 *
 * One primitive and a few compositions, so every route's loading.tsx sketches
 * the page it stands in for instead of the same four grey cards. The pulse is
 * suppressed under `prefers-reduced-motion` (Tailwind's `motion-reduce:`), which
 * the old one-off skeleton forgot; and the container carries `role="status"` so
 * a screen reader hears "loading" once rather than a page of unlabeled boxes.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-surface-raised ${className}`} aria-hidden="true" />;
}

/** The shape a `Poster` occupies while the real one is on its way. */
export function SkeletonPoster({ className = "" }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="aspect-2/3 w-full rounded-lg border border-line bg-surface-raised" />
      <div className="mt-2 h-3.5 w-3/4 rounded bg-surface-raised" />
      <div className="mt-1.5 h-3 w-1/3 rounded bg-surface-raised" />
    </div>
  );
}

/** A rail of posters, as the home and topic pages lay them out. */
export function SkeletonRail({ items = 6 }: { items?: number }) {
  return (
    <div>
      <Skeleton className="h-3.5 w-36" />
      <div className="mt-4 flex gap-4 overflow-hidden">
        {Array.from({ length: items }).map((_, i) => (
          <SkeletonPoster key={i} className="w-40 shrink-0" />
        ))}
      </div>
    </div>
  );
}

/** The poster grid, as /movies draws it. */
export function SkeletonPosterGrid({ items = 15 }: { items?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: items }).map((_, i) => (
        <SkeletonPoster key={i} />
      ))}
    </div>
  );
}

/** A person card: centred portrait over two lines, as PersonCard draws it. */
export function SkeletonPersonGrid({ items = 12 }: { items?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col items-center rounded-xl border border-line bg-surface p-4"
          aria-hidden="true"
        >
          <div className="size-24 rounded-full bg-surface-raised" />
          <div className="mt-3 h-3.5 w-24 rounded bg-surface-raised" />
          <div className="mt-2 h-3 w-16 rounded bg-surface-raised" />
        </div>
      ))}
    </div>
  );
}

/** Lines of prose, for review bodies and synopses. */
export function SkeletonProse({ lines = 6 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/**
 * The shared wrapper: pulse (unless the reader asked for stillness), one status
 * announcement, and the page's usual vertical rhythm.
 */
export function SkeletonPage({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="animate-pulse space-y-10 motion-reduce:animate-none"
      role="status"
      aria-label="Loading"
    >
      {children}
    </div>
  );
}
