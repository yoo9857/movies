import { defineConfig } from "prisma/config";

// The CLI reads DATABASE_URL from the environment. Load it from the app's env
// file when one is present, so `npm run db:*` works from a plain shell without
// exporting anything by hand.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, "..", "..", "apps", "web", ".env.local");

if (!process.env.DATABASE_URL && existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*DATABASE_URL\s*=\s*(.*)\s*$/.exec(line);
    if (m) {
      process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "");
      break;
    }
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
