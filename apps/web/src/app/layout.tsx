import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { JsonLd } from "@/components/JsonLd";
import { absUrl, graph, INDEXABLE, organizationNode, webSiteNode } from "@/lib/seo";
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LOCALE,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  VERIFICATION,
} from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME, url: `${SITE_URL}/about` }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Film criticism",
  // No `alternates.canonical` here on purpose: metadata merges one whole key at
  // a time, so a canonical set at the root would be inherited by any page that
  // forgot its own — quietly canonicalising the whole site to the home page.
  // Every page declares its own through `pageMetadata`.
  alternates: {
    types: {
      "application/rss+xml": absUrl("/feed.xml"),
      "application/feed+json": absUrl("/feed.json"),
    },
  },
  robots: INDEXABLE,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    locale: SITE_LOCALE,
    url: `${SITE_URL}/`,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { title: SITE_NAME, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, email: false, address: false },
  // Emitted only where a token exists, so an unverified deploy carries no empty
  // verification tags.
  verification: {
    google: VERIFICATION.google,
    yandex: VERIFICATION.yandex,
    other: VERIFICATION.bing ? { "msvalidate.01": VERIFICATION.bing } : undefined,
  },
};

export const viewport = {
  themeColor: "#0b0b0f",
  colorScheme: "dark" as const,
};

/**
 * Publisher and site identity, on every page. Page-level graphs reference these
 * two `@id`s instead of restating them, so a crawler resolves one CinePixo
 * rather than a separate organisation per URL.
 */
const siteGraph = graph(organizationNode(), webSiteNode());

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <JsonLd data={siteGraph} />
        {children}
      </body>
    </html>
  );
}
