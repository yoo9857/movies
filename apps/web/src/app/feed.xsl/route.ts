// The feed stylesheet — how /feed.xml looks when a human opens it.
import { FEED_XSL, xslResponse } from "@/lib/xml-style";

export function GET(): Response {
  return xslResponse(FEED_XSL);
}
