import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/client";

const dir = path.dirname(fileURLToPath(import.meta.url));
const defaultUrl = "file:" + path.join(dir, "..", "prisma", "dev.db");

function createClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? defaultUrl,
  });
  const client = new PrismaClient({ adapter });

  // SQLite defaults are wrong for a web server: rollback journalling blocks
  // readers behind every write, and a writer that finds the file locked fails
  // instantly instead of waiting. The site writes on ordinary page views (the
  // view counter), so both matter.
  //   WAL          — readers never block on a writer
  //   busy_timeout — a contending writer waits 5s rather than throwing
  //   synchronous  — NORMAL is the accepted durability trade-off under WAL
  void client
    .$executeRawUnsafe("PRAGMA journal_mode = WAL")
    .then(() => client.$executeRawUnsafe("PRAGMA busy_timeout = 5000"))
    .then(() => client.$executeRawUnsafe("PRAGMA synchronous = NORMAL"))
    .catch(() => {
      /* advisory only — a Postgres URL, or a locked file, is not fatal here */
    });

  return client;
}

// dev 핫리로드 시 커넥션 누수 방지를 위한 글로벌 싱글턴
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "./generated/client";
