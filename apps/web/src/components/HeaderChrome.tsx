"use client";

// Netflix-style nav: fixed, transparent over the billboard, solid once scrolled.
import { useEffect, useState } from "react";

export function HeaderChrome({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        scrolled
          ? "border-b border-line bg-background/85 backdrop-blur"
          : "border-b border-transparent bg-gradient-to-b from-black/70 via-black/30 to-transparent"
      }`}
    >
      {children}
    </header>
  );
}
