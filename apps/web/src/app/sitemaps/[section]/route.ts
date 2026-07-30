// GET /sitemaps/{section}.xml — one shelf of the sitemap tree.
import { NextResponse } from "next/server";
import {
  SECTIONS,
  type Section,
  sectionUrls,
  sitemapResponse,
  urlsetXml,
} from "@/lib/sitemap-data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ section: string }> },
): Promise<Response> {
  const { section } = await ctx.params;

  // The param arrives as "reviews.xml"; anything not on the fixed list is a
  // 404, not a query — there is no dynamic content under this prefix.
  const name = section.replace(/\.xml$/, "");
  if (!section.endsWith(".xml") || !SECTIONS.includes(name as Section)) {
    return new NextResponse(null, { status: 404 });
  }

  return sitemapResponse(urlsetXml(await sectionUrls(name as Section)));
}
