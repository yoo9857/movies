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
  return new PrismaClient({ adapter });
}

// dev 핫리로드 시 커넥션 누수 방지를 위한 글로벌 싱글턴
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "./generated/client";
