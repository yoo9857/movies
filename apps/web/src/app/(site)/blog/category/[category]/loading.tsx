import { Skeleton, SkeletonPage } from "@/components/Skeleton";

/**
 * A shelf warming up.
 *
 * The same rows as `/blog`, under a breadcrumb and a blurb — this route was the
 * one blog page with no placeholder, so a click from the front page sat on the
 * old screen while two queries ran.
 */
export default function Loading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-full max-w-2xl" />
      <div className="space-y-6 pt-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4" aria-hidden="true">
            <Skeleton className="hidden h-[4.6rem] w-28 shrink-0 sm:block" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
