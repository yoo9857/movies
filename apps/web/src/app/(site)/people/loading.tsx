import { Skeleton, SkeletonPage, SkeletonPersonGrid } from "@/components/Skeleton";

/** The credits roll assembling: role filters, the letter bar, then faces. */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="space-y-4">
        <Skeleton className="h-8 w-36" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-6 w-full max-w-xl" />
      </div>
      <SkeletonPersonGrid />
    </SkeletonPage>
  );
}
