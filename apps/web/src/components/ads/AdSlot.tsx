"use client";

// One ad unit, in a box that was already the right size before it arrived.
//
// The whole design of this component is about not moving the page. An ad that
// arrives into zero height pushes the article down under the reader's cursor,
// which is the single worst thing advertising does to a reading site and the
// thing Core Web Vitals measures as CLS. So the container reserves its height
// from the first paint, and the unit fills it or leaves it empty.
//
// It is also labelled. A reader is entitled to know which rectangle was paid
// for, and Google's own policy requires that ads not be presented as content.
import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT } from "./AdSenseScript";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot({
  slot,
  height = 600,
  label = "Advertisement",
  className = "",
}: {
  /** The ad unit id from the AdSense dashboard. */
  slot: string;
  /** Reserved height in px. Must match the unit, or the reservation is theatre. */
  height?: number;
  label?: string;
  className?: string;
}) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT || pushed.current) return;
    // React 18/19 mounts effects twice in development; pushing the same slot
    // twice makes AdSense log "already have ads in them" and fill neither.
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // A blocked or failed ad is not an error the reader should ever see.
    }
  }, []);

  if (!ADSENSE_CLIENT || !slot) return null;

  return (
    <aside className={className} aria-label={label}>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted/70">{label}</p>
      <div className="mt-2 overflow-hidden" style={{ minHeight: height }}>
        <ins
          className="adsbygoogle block"
          style={{ display: "block", minHeight: height }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </aside>
  );
}
