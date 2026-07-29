export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading" role="status">
      <div className="h-8 w-48 rounded bg-surface-raised" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-xl border border-line bg-surface p-4">
            <div className="h-36 w-24 shrink-0 rounded-md bg-surface-raised" />
            <div className="flex-1 space-y-3 py-1">
              <div className="h-3 w-24 rounded bg-surface-raised" />
              <div className="h-4 w-3/4 rounded bg-surface-raised" />
              <div className="h-3 w-full rounded bg-surface-raised" />
              <div className="h-3 w-1/2 rounded bg-surface-raised" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
