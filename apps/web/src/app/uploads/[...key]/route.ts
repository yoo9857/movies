import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { etagFor, resolveLocalKey } from "@/lib/media/storage";

/**
 * Serves locally-stored uploads.
 *
 * This used to refuse everything the moment a bucket was configured, on the
 * assumption that a deploy provisions storage before anyone uploads anything.
 * That assumption expired: this deploy ran the local driver through the poster
 * and portrait passes and holds ~93,000 files, so flipping `S3_*` on would have
 * turned every poster and every face on the site into a 404 in one restart.
 *
 * So the driver no longer decides. **Existence on disk does** — a key is either
 * in the local tree or it is not, and keys are unique and never reused, so there
 * is no case where two stores could disagree about one. New uploads go to the
 * bucket, the legacy tree keeps answering, and the migration can move files at
 * its own pace instead of inside a restart. When the tree is empty this handler
 * answers 404 on its own, which is the point at which it can be deleted.
 *
 * Nothing here trusts the request path: `resolveLocalKey` compares the
 * *resolved* filesystem path against the upload root, so a traversal attempt
 * cannot escape it however it is encoded.
 *
 * Keys are unique per upload, so responses are immutable.
 *
 * Images are small and buffered whole, with a content hash for the ETag.
 * Video is neither: a trailer is tens of megabytes and a <video> element seeks
 * with Range requests, so video streams from disk in the requested slice, and
 * its ETag comes from size+mtime — hashing forty megabytes per request to
 * save re-sending them would be self-defeating.
 */
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
};

const STREAMED = new Set(["mp4", "webm"]);

export async function GET(
  request: Request,
  ctx: { params: Promise<{ key: string[] }> },
) {
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

    if (STREAMED.has(ext)) {
      const etag = `"${info.size}-${Math.round(info.mtimeMs)}"`;
      if (request.headers.get("if-none-match") === etag) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag } });
      }

      const size = info.size;
      let start = 0;
      let end = size - 1;
      const range = request.headers.get("range");
      const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
      if (range && !match) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      if (match) {
        if (match[1] !== "") start = Number(match[1]);
        if (match[2] !== "") end = Math.min(Number(match[2]), size - 1);
        // A suffix range ("bytes=-500") asks for the last N bytes.
        if (match[1] === "" && match[2] !== "") {
          start = Math.max(0, size - Number(match[2]));
          end = size - 1;
        }
        if (start > end || start >= size) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${size}` },
          });
        }
      }

      const stream = Readable.toWeb(
        createReadStream(file, { start, end }),
      ) as ReadableStream;
      return new NextResponse(stream, {
        status: match ? 206 : 200,
        headers: {
          "Content-Type": type,
          "Content-Length": String(end - start + 1),
          ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
          "Accept-Ranges": "bytes",
          ETag: etag,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

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
