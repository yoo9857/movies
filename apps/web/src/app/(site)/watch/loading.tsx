import { Skeleton, SkeletonPage, SkeletonRail } from "@/components/Skeleton";

/** The free shelf warming up: a heading, a line of blurb, then two grids. */
export default function Loading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-4 w-[42ch]" />
      <SkeletonRail />
      <SkeletonRail />
    </SkeletonPage>
  );
}
