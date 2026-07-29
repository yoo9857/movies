import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

// 개발용 SQLite 파일 경로 — 어디서 실행되든 항상 이 패키지 기준으로 고정
const defaultUrl = "file:" + path.join(dir, "prisma", "dev.db");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? defaultUrl,
  },
});
