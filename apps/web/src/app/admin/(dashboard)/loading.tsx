import { Skeleton, SkeletonPage } from "@/components/Skeleton";

/**
 * The desk, before the papers land: a heading and table rows. Admin pages had
 * no loading state at all — they sit outside (site) and inherited nothing.
 */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-line bg-surface p-4 last:border-b-0">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
