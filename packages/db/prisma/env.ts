// Loads apps/web/.env.local into process.env, so `npm run db:*` works from a
// plain shell without exporting anything by hand.
//
// This exists because the Prisma CLI and the seed scripts reach the database by
// different routes. The CLI reads prisma.config.ts, which can load an env file
// itself; the seed scripts run under tsx and never touch that config, so they
// used to fail with "DATABASE_URL is not set" despite a filled-in .env.local
// sitting right there. Both now import this.
//
// Real environment variables win over the file. On the server DATABASE_URL is
// exported by pm2 and there is no .env.local at all; in a local shell, an
// explicit `$env:DATABASE_URL=...` is a deliberate override for pointing at a
// scratch database, and reading the file over it would silently ignore it.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, "..", "..", "..", "apps", "web", ".env.local");

export function loadEnvLocal(): void {
  if (!existsSync(envFile)) return;

  for (const raw of readFileSync(envFile, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 1) continue;

    const key = line.slice(0, eq).trim();
    // An already-set variable is an intentional override — leave it alone.
    if (process.env[key]) continue;

    // Strip one layer of matching quotes; an unquoted value keeps its spaces
    // trimmed, which is what every .env parser does and what the file expects.
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    process.env[key] = value;
  }
}

// Importing this module is the point — the seed scripts want the side effect
// before their first query, without a call site that a refactor could drop.
loadEnvLocal();
