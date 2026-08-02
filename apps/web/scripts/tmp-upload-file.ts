// One-off: put a local file onto our public storage and print its URL.
//
//   npx tsx scripts/tmp-upload-file.ts <local-file> <bucket-key>
//   npx tsx scripts/tmp-upload-file.ts /tmp/photo.jpg petmarket/cz7603/main-800.jpg
//
// Same storage the app uses (putPublicObject) — nothing here touches
// credentials directly. Output is the public URL, one line.
import "../../../packages/db/prisma/env";
import { readFileSync } from "node:fs";
import { putPublicObject } from "@/lib/media/storage";

const [file, key] = process.argv.slice(2);
if (!file || !key) {
  console.error("usage: tsx scripts/tmp-upload-file.ts <local-file> <bucket-key>");
  process.exit(1);
}

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const ext = file.split(".").pop()?.toLowerCase() ?? "";
const contentType = TYPES[ext];
if (!contentType) {
  console.error(`unsupported extension: ${ext}`);
  process.exit(1);
}

async function main() {
  const url = await putPublicObject(key, readFileSync(file), contentType);
  console.log(url);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
