// Visible breadcrumbs, paired with the BreadcrumbList in the page graph.
//
// Google will only show a breadcrumb trail it can also see rendered, and an
// answer engine summarising a page uses the trail to state where it sits. So
// the markup and the structured data are always emitted together — see
// `breadcrumbNode` in lib/seo.
import Link from "next/link";
import type { Crumb } from "@/lib/seo";

export function Breadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  const all: Crumb[] = [{ name: "Home", path: "/" }, ...trail];

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {all.map((crumb, i) => {
          const isLast = i === all.length - 1;
          return (
            <li key={`${crumb.name}-${i}`} className="flex min-w-0 items-center gap-2">
              {i > 0 && (
                <span aria-hidden="true" className="text-line">
                  /
                </span>
              )}
              {isLast || !crumb.path ? (
                <span aria-current="page" className="truncate text-foreground/70">
                  {crumb.name}
                </span>
              ) : (
                <Link href={crumb.path} className="transition-colors hover:text-accent">
                  {crumb.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
