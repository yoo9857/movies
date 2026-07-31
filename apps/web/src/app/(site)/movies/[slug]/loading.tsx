import { Skeleton, SkeletonPage, SkeletonProse } from "@/components/Skeleton";

/** A film page taking shape: poster plate left, title and synopsis right. */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="grid gap-8 sm:grid-cols-[14rem_1fr]">
        <div className="aspect-2/3 w-56 max-w-full rounded-xl border border-line bg-surface-raised" />
        <div className="space-y-5 py-1">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-4 w-40" />
          <SkeletonProse lines={5} />
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-10 w-36 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="space-y-3 border-t border-line pt-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between border-b border-line py-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
