import { Skeleton, SkeletonPage, SkeletonPosterGrid, SkeletonProse } from "@/components/Skeleton";

/** A person page on its way: portrait, the facts column, then their films. */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="grid gap-8 sm:grid-cols-[11rem_1fr]">
        <div className="size-44 rounded-xl border border-line bg-surface-raised" />
        <div className="space-y-4 py-1">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-40" />
          <SkeletonProse lines={3} />
        </div>
      </div>
      <div className="space-y-4 border-t border-line pt-8">
        <Skeleton className="h-3.5 w-32" />
        <SkeletonPosterGrid items={10} />
      </div>
    </SkeletonPage>
  );
}
