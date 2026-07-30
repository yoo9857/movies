// A throwaway database per test file, built from the real migrations.
//
// These tests exist to check the constraints Prisma cannot express — CHECKs,
// LOWER() unique indexes, trigram indexes — which by definition only exist in
// PostgreSQL. So they talk to `pg` directly rather than through the generated
// client: the subject is the schema, not the ORM.
//
// The migrations are applied as SQL in filename order, which is what
// `prisma migrate deploy` does minus its bookkeeping table. Reusing the real
// files means a hand-written constraint cannot drift away from what is tested.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const MIGRATIONS = path.resolve(import.meta.dirname, "..", "..", "prisma", "migrations");

/**
 * The database these tests may freely drop and recreate.
 *
 * Derived from DATABASE_URL by suffixing the database name, so pointing at a
 * development database cannot destroy it — `cinepixo` becomes `cinepixo_test`.
 * TEST_DATABASE_URL overrides it outright.
 */
export function scratchUrl(suffix: string): { admin: string; test: string; name: string } | null {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) return null;

  const url = new URL(base);
  const original = url.pathname.replace(/^\//, "") || "postgres";
  const name = `${original}_test_${suffix}`;

  const test = new URL(url.toString());
  test.pathname = `/${name}`;

  // DDL cannot run against the database being dropped; connect elsewhere for it.
  const admin = new URL(url.toString());
  admin.pathname = "/postgres";

  return { admin: admin.toString(), test: test.toString(), name };
}

async function withClient<T>(url: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Drops, recreates and migrates the scratch database. Returns a live client. */
export async function createScratchDb(suffix: string): Promise<Client> {
  const urls = scratchUrl(suffix);
  if (!urls) throw new Error("DATABASE_URL is not set");

  await withClient(urls.admin, async (admin) => {
    // FORCE terminates leftover connections from an interrupted run; without it
    // a stale session makes DROP hang until it times out.
    await admin.query(`DROP DATABASE IF EXISTS "${urls.name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${urls.name}"`);
  });

  const client = new Client({ connectionString: urls.test });
  await client.connect();

  const dirs = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dir of dirs) {
    const sql = readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8");
    await client.query(sql);
  }

  return client;
}

export async function dropScratchDb(client: Client, suffix: string): Promise<void> {
  const urls = scratchUrl(suffix);
  await client.end();
  if (!urls) return;
  await withClient(urls.admin, async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS "${urls.name}" WITH (FORCE)`);
  });
}

/** True when a constraint rejected the statement, with the SQLSTATE we expect. */
export async function violates(
  client: Client,
  sql: string,
  params: unknown[],
  sqlstate: string,
): Promise<boolean> {
  try {
    await client.query(sql, params as never[]);
    return false;
  } catch (e) {
    return (e as { code?: string }).code === sqlstate;
  }
}
