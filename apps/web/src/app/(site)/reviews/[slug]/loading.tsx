import { Skeleton, SkeletonPage, SkeletonProse } from "@/components/Skeleton";

/** An article clearing its throat: kicker, headline, byline, prose. */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="mx-auto max-w-3xl space-y-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-10 w-5/6" />
        <Skeleton className="h-4 w-56" />
        <div className="pt-6">
          <SkeletonProse lines={12} />
        </div>
      </div>
    </SkeletonPage>
  );
}
