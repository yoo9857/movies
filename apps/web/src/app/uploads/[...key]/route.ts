import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { etagFor, resolveLocalKey, usingObjectStorage } from "@/lib/media/storage";

/**
 * Serves locally-stored uploads.
 *
 * Only reachable when object storage is not configured; with a bucket in play
 * these URLs are never minted and this handler answers 404. Nothing here trusts
 * the request path: `resolveLocalKey` compares the *resolved* filesystem path
 * against the upload root, so a traversal attempt cannot escape it however it
 * is encoded.
 *
 * Keys are unique per upload, so responses are immutable.
 */
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  avif: "image/avif",
};

export async function GET(
  request: Request,
  ctx: { params: Promise<{ key: string[] }> },
) {
  if (usingObjectStorage) return new NextResponse(null, { status: 404 });

  const { key } = await ctx.params;
  const joined = key.join("/");
  const file = resolveLocalKey(joined);
  if (!file) return new NextResponse(null, { status: 404 });

  const ext = joined.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[ext];
  // Only ever serve the handful of types the pipeline produces. Anything else
  // on disk is not ours to hand out.
  if (!type) return new NextResponse(null, { status: 404 });

  try {
    const info = await stat(file);
    if (!info.isFile()) return new NextResponse(null, { status: 404 });

    const body = await readFile(file);
    const etag = etagFor(body);
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(body.byteLength),
        ETag: etag,
        "Cache-Control": "public, max-age=31536000, immutable",
        // Belt and braces: an image endpoint should never be sniffed into
        // something executable.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
