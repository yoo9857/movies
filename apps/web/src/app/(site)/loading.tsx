import { Skeleton, SkeletonPage, SkeletonRail } from "@/components/Skeleton";

/**
 * The (site) fallback — in practice mostly the home page, since the heavy
 * routes each sketch their own shape. A billboard void, then a rail.
 */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="relative -mt-6 flex min-h-[24rem] flex-col justify-end overflow-hidden rounded-xl border border-line bg-surface p-8">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-10 w-2/3 max-w-xl" />
        <Skeleton className="mt-4 h-4 w-1/2 max-w-md" />
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-10 w-40 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>
      <SkeletonRail />
    </SkeletonPage>
  );
}
