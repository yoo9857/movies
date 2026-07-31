import { Skeleton, SkeletonPage, SkeletonRail } from "@/components/Skeleton";

/** The taxonomy desk warming up: a heading, then shelves of posters. */
export default function Loading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-8 w-44" />
      <SkeletonRail />
      <SkeletonRail />
      <SkeletonRail />
    </SkeletonPage>
  );
}
