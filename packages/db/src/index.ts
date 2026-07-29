import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

/**
 * The database connection.
 *
 * Everything here exists because a web app talking to Postgres over a socket
 * has failure modes a local file never had: the pool can be exhausted, the
 * server can be restarting, a query can hang, and a request can arrive during
 * any of it. The settings below bound each of those.
 *
 * The client is built on first use, not on import. Importing this module must
 * stay free of side effects: `next build` loads every route to collect its
 * metadata, and a build machine has no business needing database credentials.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    // Thrown at first query rather than at import, so the message arrives with
    // a stack that points at the query instead of at a build step.
    throw new Error(
      `${name} is not set. Copy .env.example to apps/web/.env.local and fill it in.`,
    );
  }
  return v;
}

function createClient(): PrismaClient {
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

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const c = createClient();
    // In production the module instance is stable, so the cache is only really
    // needed for dev reloads — but caching in both keeps one code path.
    globalForPrisma.prisma = c;
  }
  return globalForPrisma.prisma;
}

/**
 * The Prisma client, created on first property access.
 *
 * A Proxy rather than a `getPrisma()` function so every existing call site —
 * `prisma.review.findMany(...)` — keeps working unchanged, and so nothing can
 * accidentally hold a stale instance across a dev reload.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const value = Reflect.get(client(), prop, receiver);
    return typeof value === "function" ? value.bind(client()) : value;
  },
  has(_target, prop) {
    return Reflect.has(client(), prop);
  },
});

export * from "./generated/client";
