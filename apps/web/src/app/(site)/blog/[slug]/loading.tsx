import { Skeleton, SkeletonPage, SkeletonProse } from "@/components/Skeleton";

/** A piece clearing its throat: shelf, headline, standfirst, byline, prose. */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="mx-auto max-w-3xl space-y-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-5/6" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-52" />
        <div className="pt-6">
          <SkeletonProse lines={12} />
        </div>
      </div>
    </SkeletonPage>
  );
}
