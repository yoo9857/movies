import { Skeleton, SkeletonPage } from "@/components/Skeleton";

/** Result rows sketched under the search box. */
export default function Loading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-12 w-full max-w-2xl rounded-lg" />
      <div className="space-y-4 pt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-xl border border-line bg-surface p-4">
            <div className="h-24 w-16 shrink-0 rounded-md bg-surface-raised" />
            <div className="flex-1 space-y-3 py-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
