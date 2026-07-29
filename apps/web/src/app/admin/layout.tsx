// Metadata-only boundary for the whole admin tree.
//
// robots.txt already disallows /admin, but a disallowed URL that leaks into the
// wild (a pasted link, a referrer log) can still be indexed from the link alone —
// a crawler that cannot fetch the page cannot read a noindex inside it. So the
// tag is set here, and `next.config.ts` sends `X-Robots-Tag` on the response too,
// which covers the client-rendered admin login that cannot export metadata.
//
// This layout deliberately renders nothing of its own: the auth boundary lives in
// admin/(dashboard)/layout.tsx and must stay the only thing enforcing access.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · CinePixo admin" },
  // Spelled out rather than reusing NOT_INDEXABLE: admin is the one place that
  // wants nofollow as well, so nothing behind it is crawled through a link.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
