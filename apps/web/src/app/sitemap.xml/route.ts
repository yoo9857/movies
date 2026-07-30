// GET /sitemap.xml — the index. Sections live under /sitemaps/*.xml, and a
// browser renders this as a folder listing via /sitemap.xsl. See
// lib/sitemap-data.ts for why this is a hand-built route rather than the
// framework's sitemap convention.
import { indexXml, sectionLastmods, sitemapResponse } from "@/lib/sitemap-data";

export const dynamic = "force-dynamic"; // always reflect the live DB

export async function GET(): Promise<Response> {
  return sitemapResponse(indexXml(await sectionLastmods()));
}
