import { defineConfig } from "prisma/config";

// The CLI reads DATABASE_URL from the environment. Importing this loads the
// app's env file when one is present, so `npm run db:*` works from a plain
// shell without exporting anything by hand. The seed scripts import the same
// module — see prisma/env.ts for why it is shared rather than inlined here.
import "./prisma/env";

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
