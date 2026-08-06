// What the storage layer is actually doing, when a URL it minted does not load.
//
//   cd apps/web && npx tsx scripts/storage-check.ts
//   npx tsx scripts/storage-check.ts --prefix=posts/
//   npx tsx scripts/storage-check.ts --url=https://…/cinepixo/posts/2026/08/x.webp
//
// The failure this exists for: `putPublicObject` returns a URL built from
// S3_PUBLIC_URL and writes an object under `key`. If the public base carries a
// path segment (…/cinepixo) that the key does not, every upload "succeeds" and
// every URL 404s — the write and the read disagree about where the object is,
// and nothing in the pipeline notices because the PUT really did work.
//
// So this prints both halves and then proves them against the bucket: what key
// was written, what key the URL asks for, and whether either exists.
import "../../../packages/db/prisma/env";
import { buildKey, usingObjectStorage } from "@/lib/media/storage";

const PREFIX = (process.argv.find((a) => a.startsWith("--prefix=")) ?? "").split("=")[1] ?? "";
const URL_ARG = (process.argv.find((a) => a.startsWith("--url=")) ?? "").split("=").slice(1).join("=");

const BUCKET = process.env.S3_BUCKET;
const PUBLIC = (process.env.S3_PUBLIC_URL ?? "").replace(/\/+$/, "");

async function s3() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: false,
  });
}

async function exists(key: string): Promise<string> {
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: BUCKET!, Key: key }));
    return `EXISTS (${head.ContentLength} bytes, ${head.ContentType})`;
  } catch (e) {
    return `missing (${(e as Error).name})`;
  }
}

async function main() {
  console.log(`driver        ${usingObjectStorage ? "object storage" : "local disk"}`);
  if (!usingObjectStorage) {
    console.log("Nothing to check: uploads are going to disk, not a bucket.");
    return;
  }
  console.log(`bucket        ${BUCKET}`);
  console.log(`public base   ${PUBLIC}`);

  // The mismatch, stated plainly.
  const basePath = (() => {
    try {
      return new URL(PUBLIC).pathname.replace(/^\/|\/$/g, "");
    } catch {
      return "";
    }
  })();
  const sample = buildKey("posts", "webp");
  console.log(`\nsample key    ${sample}          <- what putPublicObject writes`);
  console.log(`sample URL    ${PUBLIC}/${sample}`);
  console.log(`URL asks for  ${basePath ? `${basePath}/${sample}` : sample}   <- what a reader fetches`);
  if (basePath) {
    console.log(
      `\n!! the public base carries the path segment "${basePath}" and the key does not.\n` +
        `   Every new upload lands at "${sample}" and every URL asks for "${basePath}/${sample}".`,
    );
  }

  if (URL_ARG) {
    const key = URL_ARG.startsWith(PUBLIC) ? URL_ARG.slice(PUBLIC.length + 1) : URL_ARG;
    console.log(`\nchecking one object:`);
    console.log(`  as written   ${key.replace(new RegExp(`^${basePath}/`), "")} -> ${await exists(key.replace(new RegExp(`^${basePath}/`), ""))}`);
    console.log(`  as fetched   ${basePath ? `${basePath}/` : ""}${key.replace(new RegExp(`^${basePath}/`), "")} -> ${await exists(basePath ? `${basePath}/${key.replace(new RegExp(`^${basePath}/`), "")}` : key)}`);
  }

  if (PREFIX) {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const client = await s3();
    for (const p of [PREFIX, basePath ? `${basePath}/${PREFIX}` : null].filter(Boolean) as string[]) {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: BUCKET!, Prefix: p, MaxKeys: 5 }),
      );
      console.log(`\nprefix "${p}": ${res.KeyCount ?? 0} object(s)`);
      for (const o of res.Contents ?? []) console.log(`  ${o.Key}  ${o.Size} bytes`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
