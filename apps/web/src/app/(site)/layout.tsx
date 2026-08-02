import { AdSenseScript } from "@/components/ads/AdSenseScript";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Public pages only. /admin has its own layout and never carries ads. */}
      <AdSenseScript />
      <SiteHeader />
      {/* header is fixed — spacer keeps normal pages clear of it (taller on
          phones, where the nav wraps to a second row); full-bleed heroes pull
          themselves up under the nav with negative margins */}
      <div className="h-[6.25rem] sm:h-14" aria-hidden="true" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
    </>
  );
}
