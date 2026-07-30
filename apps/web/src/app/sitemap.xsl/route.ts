// The sitemap stylesheet. A route rather than a public file because browsers
// refuse to run an XSLT served with the wrong MIME type.
import { SITEMAP_XSL, xslResponse } from "@/lib/xml-style";

export function GET(): Response {
  return xslResponse(SITEMAP_XSL);
}
