import path from "node:path";
import { defineConfig } from "vitest/config";

// Two suites, kept apart on purpose.
//
//  · `npm test` — unit tests. No database, no network, no build step. Every
//    invariant that can be checked in memory is checked here, so the suite
//    stays fast enough to run on every save.
//  · `npm run test:db` — integration tests against a real PostgreSQL. These
//    verify the constraints Prisma cannot express (CHECKs, LOWER() unique
//    indexes), which by definition only exist in the database. They need
//    DATABASE_URL and they create and drop their own schema, so they are opt-in
//    rather than part of the default run.
//
// Split via the `db` project's include, selected with `--project`.

const web = path.resolve(import.meta.dirname, "apps/web/src");

export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path alias in apps/web/tsconfig.json.
    alias: { "@": web },
  },
  test: {
    projects: [
      {
        resolve: { alias: { "@": web } },
        test: {
          name: "unit",
          environment: "node",
          include: ["{apps,packages}/*/test/**/*.test.{ts,tsx}"],
          exclude: ["**/node_modules/**", "**/*.db.test.ts"],
        },
      },
      {
        test: {
          name: "db",
          environment: "node",
          include: ["packages/db/test/**/*.db.test.ts"],
          // scrypt hashing and a real connection are both slow; a migration
          // deploy on a cold database is slower still.
          testTimeout: 60_000,
          hookTimeout: 120_000,
          // One database, one schema — parallel files would race on DDL.
          fileParallelism: false,
        },
      },
    ],
  },
});
