// The site card. See lib/og-site-image.tsx — file-based OG images do not
// inherit into child segments, so each listing re-exports the one handler.
export { default, alt, size, contentType } from "@/lib/og-site-image";

export const dynamic = "force-dynamic";
