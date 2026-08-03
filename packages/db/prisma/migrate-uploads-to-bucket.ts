// Move the legacy local upload tree into the object bucket, one row at a time.
//
//   npm run db:migrate-uploads -- --dry --limit=20
//   npm run db:migrate-uploads -- --limit=5000
//   npm run db:migrate-uploads -- --table=Movie --column=trailerFile
//
// This exists because the local driver carried the poster and portrait passes:
// 62,374 posters, 26,958 portraits and 209 trailers landed in `var/uploads` on
// a 157 GB disk shared with ten other services, and the nightly backup tars all
// of it. The bucket was configured afterwards, which is the opposite of the
// order the storage module was written for — hence a migration rather than a
// switch.
//
// Four rules, each the answer to a way this could go wrong:
//
//  · **The database is written only after the object verifies.** Upload, HEAD
//    the public URL, then update the row. An interrupted run therefore leaves
//    working URLs on both sides of the cut and never a broken one.
//  · **Nothing local is deleted.** The tree stays until a separate, deliberate
//    pass removes it, and the /uploads route keeps answering for whatever has
//    not moved yet. Orphans are cheap; a lost original is not.
//  · **Resumable by construction.** The queue is "rows whose URL still starts
//    with /uploads/", so re-running picks up exactly what is left. There is no
//    cursor file to go stale, and no run can skip work a previous one dropped.
//  · **Same key, new home.** Only the prefix of a URL changes, so the mapping
//    stays checkable by eye and `deleteByUrl` keeps working for both shapes.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Resolved through the workspace root, where apps/web's dependency hoists it.
// Deliberately not added to this package's own dependencies: `npm install` on
// the Windows dev machine prunes ~544 lines of platform-specific optional
// entries out of package-lock.json, which weakens the Linux server's install —
// and a one-off migration tool is not worth that trade.
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import "./env";
import { prisma } from "../src/index";

const LOCAL_PREFIX = "/uploads/";

/**
 * Where the local driver wrote. Resolved from this file rather than
 * `process.cwd()`: storage.ts can use cwd because pm2 runs it from `apps/web`,
 * but `npm run db:*` runs from `packages/db`, so the same expression would point
 * at a directory that does not exist and every row would look MISSING.
 */
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LOCAL_ROOT = process.env.UPLOAD_DIR ?? path.join(REPO_ROOT, "var", "uploads");

const args = process.argv.slice(2);
const has = (n: string) => args.includes(`--${n}`);
const val = (n: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};

const DRY = has("dry");
const LIMIT = Number(val("limit") ?? 500);
const ONLY_TABLE = val("table");
const ONLY_COLUMN = val("column");

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_REGION = process.env.S3_REGION;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET = process.env.S3_SECRET_KEY;
const S3_PUBLIC = (process.env.S3_PUBLIC_URL ?? "").replace(/\/+$/, "");

if (!S3_ENDPOINT || !S3_BUCKET || !S3_KEY || !S3_SECRET || !S3_PUBLIC) {
  // Refusing here rather than falling back: a "migration" that quietly wrote
  // local paths back into the database would be indistinguishable from success.
  console.error(
    "Object storage is not configured (S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY/S3_PUBLIC_URL).",
  );
  process.exit(1);
}

/** The bucket is shared, so keys live under the prefix S3_PUBLIC_URL names. */
const KEY_PREFIX = new URL(S3_PUBLIC).pathname.replace(/^\/+|\/+$/g, "");

const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION ?? "us-east-1",
  credentials: { accessKeyId: S3_KEY, secretAccessKey: S3_SECRET },
  forcePathStyle: false,
});

/**
 * Every column that can hold a local upload URL, cheapest first — so a short
 * run proves the mechanism on eleven avatars before it touches 62,374 posters.
 * Identifiers come from this literal list and never from input.
 */
const TARGETS = [
  { table: "User", column: "avatarUrl" },
  { table: "Critic", column: "avatarUrl" },
  { table: "Movie", column: "filmFile" },
  { table: "Movie", column: "trailerFile" },
  { table: "Person", column: "image" },
  { table: "Movie", column: "image" },
] as const;

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

const contentType = (key: string) =>
  TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

const gb = (n: number) => (n / 1_073_741_824).toFixed(2);

async function main() {
  let moved = 0;
  let bytes = 0;
  let missing = 0;
  let failed = 0;
  let budget = LIMIT;

  console.log(
    `${DRY ? "[dry] " : ""}bucket=${S3_BUCKET} prefix=${KEY_PREFIX}/ limit=${LIMIT} root=${LOCAL_ROOT}`,
  );

  for (const { table, column } of TARGETS) {
    if (budget <= 0) break;
    if (ONLY_TABLE && table !== ONLY_TABLE) continue;
    if (ONLY_COLUMN && column !== ONLY_COLUMN) continue;

    const rows = await prisma.$queryRawUnsafe<{ id: string; url: string }[]>(
      `SELECT id, "${column}" AS url FROM "${table}" WHERE "${column}" LIKE '/uploads/%' LIMIT ${budget}`,
    );
    if (rows.length === 0) {
      console.log(`${table}.${column}: nothing left`);
      continue;
    }
    console.log(`${table}.${column}: ${rows.length} to move`);

    for (const row of rows) {
      if (budget <= 0) break;
      const key = row.url.slice(LOCAL_PREFIX.length);
      const file = path.resolve(LOCAL_ROOT, key);
      if (!file.startsWith(path.resolve(LOCAL_ROOT) + path.sep)) {
        console.log(`  SKIP escapes upload root: ${row.url}`);
        failed++;
        continue;
      }

      let body: Buffer;
      try {
        body = await readFile(file);
      } catch {
        // The row points at a file that is not on disk. Rewriting it would move
        // a broken URL to a new home rather than fix it, so it is left alone
        // and counted — this is the number that says "the tree is not the whole
        // truth" if it is ever non-zero.
        console.log(`  MISSING on disk, left as-is: ${row.url}`);
        missing++;
        continue;
      }

      if (DRY) {
        console.log(`  would move ${key} (${(body.length / 1024).toFixed(0)} KB)`);
        moved++;
        bytes += body.length;
        budget--;
        continue;
      }

      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: `${KEY_PREFIX}/${key}`,
            Body: body,
            ContentType: contentType(key),
            // Keys are never reused, so every object is immutable for a year.
            CacheControl: "public, max-age=31536000, immutable",
            // No ACL: this bucket generation answers 501 to per-object ACLs and
            // public read already comes from the bucket policy.
          }),
        );

        const url = `${S3_PUBLIC}/${key}`;
        const head = await fetch(url, { method: "HEAD" });
        if (!head.ok) throw new Error(`public HEAD ${head.status}`);

        // Guarded on the old value, so a concurrent writer that replaced this
        // image mid-run keeps its newer URL instead of being clobbered.
        await prisma.$executeRawUnsafe(
          `UPDATE "${table}" SET "${column}" = $1 WHERE id = $2 AND "${column}" = $3`,
          url,
          row.id,
          row.url,
        );
        moved++;
        bytes += body.length;
      } catch (err) {
        console.log(`  FAIL ${key}: ${(err as Error).message}`);
        failed++;
      }
      budget--;
      if (moved > 0 && moved % 500 === 0) {
        console.log(`  … ${moved} moved, ${gb(bytes)} GB`);
      }
    }
  }

  console.log(
    `\n${DRY ? "[dry] " : ""}moved=${moved} missing=${missing} failed=${failed} bytes=${gb(bytes)} GB`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
