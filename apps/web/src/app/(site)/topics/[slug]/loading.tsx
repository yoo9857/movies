import { Skeleton, SkeletonPage, SkeletonPosterGrid, SkeletonProse } from "@/components/Skeleton";

/** One topic: its argument first, then the films that make it. */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-3/4" />
        <SkeletonProse lines={3} />
      </div>
      <SkeletonPosterGrid items={10} />
    </SkeletonPage>
  );
}
