import { Skeleton, SkeletonPage, SkeletonPosterGrid } from "@/components/Skeleton";

/** The library, before the library: filter bar, then the poster grid. */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <SkeletonPosterGrid />
    </SkeletonPage>
  );
}
