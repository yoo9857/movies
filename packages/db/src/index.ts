import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

/**
 * The database connection.
 *
 * Everything here exists because a web app talking to Postgres over a socket
 * has failure modes a local file never had: the pool can be exhausted, the
 * server can be restarting, a query can hang, and a request can arrive during
 * any of it. The settings below bound each of those.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    // Fail loudly at startup rather than at the first query, when the stack
    // trace would point at some unrelated page.
    throw new Error(
      `${name} is not set. Copy .env.example to apps/web/.env.local and fill it in.`,
    );
  }
  return v;
}

function createClient() {
  const adapter = new PrismaPg({
    connectionString: required("DATABASE_URL"),
    // The app runs as a single pm2 process; keep well under the server's 60.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Don't queue a request forever behind an exhausted pool — fail fast so the
    // route handler can return 503 instead of the browser spinning.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // A request that cannot finish in 15s is not going to help anyone; the
    // server enforces this too, this is the client-side guard.
    statement_timeout: 15_000,
    query_timeout: 15_000,
    application_name: "cinepixo-web",
  });

  return new PrismaClient({
    adapter,
    // Warnings and errors only: query logging on every request is noise that
    // hides the lines that matter.
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });
}

// A hot reload in development must not open a new pool each time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "./generated/client";
