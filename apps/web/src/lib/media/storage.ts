/**
 * Object storage for user uploads.
 *
 * Ported from the pokemondive service, with one addition: a local-disk driver,
 * so uploads work on a fresh deploy before anyone has provisioned a bucket.
 * Both drivers hand back a URL and take a key, so nothing above this file knows
 * which one is in play.
 *
 * Keys are unique per upload, never reused, which is what lets everything be
 * served immutable — a changed avatar is a new key, not a new version of an old
 * one, so no cache anywhere needs invalidating.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_REGION = process.env.S3_REGION ?? "us-east-1";
const S3_BUCKET = process.env.S3_BUCKET;
const S3_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET = process.env.S3_SECRET_KEY;
const S3_PUBLIC = (process.env.S3_PUBLIC_URL ?? "").replace(/\/+$/, "");

export const usingObjectStorage = Boolean(
  S3_ENDPOINT && S3_BUCKET && S3_KEY && S3_SECRET && S3_PUBLIC,
);

/** Where the local driver writes. Outside `public/` so nothing is served
 *  except through the route handler that validates the path. */
export const LOCAL_ROOT =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "..", "..", "var", "uploads");

/** Public prefix the local driver serves from. */
const LOCAL_PREFIX = "/uploads";

/**
 * The path segment the public base carries, if any — "cinepixo" for a base of
 * `https://bucket.region.linodeobjects.com/cinepixo`.
 *
 * This site shares one bucket with another service, so its objects live under
 * a prefix and the public URL includes it. That prefix is part of the object's
 * *key*: a reader fetching `…/cinepixo/posts/x.webp` is asking the bucket for
 * `cinepixo/posts/x.webp`, not `posts/x.webp`.
 *
 * Missing that cost every post image on the first piece we published. The PUT
 * succeeded, the URL was well-formed, the CHECK constraint passed, and all
 * seven pictures 404'd — the write and the read simply disagreed about where
 * the object was, and nothing in the pipeline is positioned to notice.
 */
export function publicBasePrefix(publicUrl: string): string {
  if (!publicUrl) return "";
  try {
    return new URL(publicUrl).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    return "";
  }
}

const S3_PREFIX = publicBasePrefix(S3_PUBLIC);

/** The key an object must be written to so its public URL resolves. */
export const objectKey = (key: string): string => (S3_PREFIX ? `${S3_PREFIX}/${key}` : key);

/**
 * A storage key: `<kind>/<yyyy>/<mm>/<uuid>.<ext>`.
 *
 * Date-partitioned because a flat bucket with a hundred thousand objects is
 * miserable to inspect, and because it makes "delete everything before X"
 * a prefix operation. The bucket prefix is added by `objectKey` at write time
 * rather than here, so a key stays the same shape on both drivers.
 */
export function buildKey(kind: string, ext: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeKind = kind.replace(/[^a-z0-9-]/g, "") || "misc";
  const safeExt = ext.replace(/[^a-z0-9]/g, "") || "bin";
  return `${safeKind}/${yyyy}/${mm}/${randomUUID()}.${safeExt}`;
}

/**
 * Is this URL one of ours — something this module minted?
 *
 * The application half of the `*_is_ours` CHECK constraints. Those columns take
 * a site-relative path or our own bucket prefix and nothing else, because "any
 * https URL" would readmit the hotlink they exist to forbid — which is how a
 * photograph we hold no licence for reaches a page.
 *
 * Checked here so a pasted third-party URL is a readable 400 from the route
 * rather than a constraint violation surfacing as a 500. The database stays the
 * authority; this is the error message.
 */
export function isOurObjectUrl(url: string): boolean {
  if (url.startsWith("/")) return true;
  return usingObjectStorage && url.startsWith(`${S3_PUBLIC}/`);
}

// The SDK is imported lazily so a deploy without object storage never loads it.
let s3Client: unknown = null;
async function s3() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: { accessKeyId: S3_KEY!, secretAccessKey: S3_SECRET! },
      forcePathStyle: false,
    });
  }
  return s3Client as InstanceType<typeof S3Client>;
}

/** Uploads an immutable object and returns the URL it will be served from. */
export async function putPublicObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  if (usingObjectStorage) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3();
    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET!,
        Key: objectKey(key),
        Body: body,
        ContentType: contentType,
        // Safe because keys are never reused.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return `${S3_PUBLIC}/${key}`;
  }

  const dest = path.join(LOCAL_ROOT, key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, body);
  return `${LOCAL_PREFIX}/${key}`;
}

/**
 * Best-effort delete. An orphaned object costs a few kilobytes; a failed delete
 * that takes down the request that was replacing an avatar costs a user.
 */
export async function deleteByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    if (usingObjectStorage && S3_PUBLIC && url.startsWith(`${S3_PUBLIC}/`)) {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await s3();
      // The key is the whole path the URL asks for, prefix included — the same
      // string `objectKey` wrote. Taken from the URL rather than rebuilt, so a
      // delete cannot drift from a put.
      await client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET!,
          Key: new URL(url).pathname.replace(/^\/+/, ""),
        }),
      );
      return;
    }
    if (url.startsWith(`${LOCAL_PREFIX}/`)) {
      const key = url.slice(LOCAL_PREFIX.length + 1);
      const resolved = resolveLocalKey(key);
      if (resolved) await unlink(resolved);
    }
  } catch {
    // Nothing here is worth failing a request over.
  }
}

/**
 * Map a public key to a path on disk, or null if it escapes the upload root.
 *
 * The check is on the *resolved* path, not on the string: `a/../../etc/passwd`
 * and `a/%2e%2e/x` both normalise before this comparison, and neither survives
 * it.
 */
export function resolveLocalKey(key: string): string | null {
  const root = path.resolve(LOCAL_ROOT);
  const target = path.resolve(root, key);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

/** Weak ETag for the local driver, so conditional requests still work. */
export function etagFor(body: Buffer): string {
  return `"${createHash("sha1").update(body).digest("base64url")}"`;
}
