# CinePixo — project notes for agents

English-language fandom site for film-critic fans (reviews, ratings, critic profiles). See README.md for stack and commands.

- Monorepo: npm workspaces. `apps/web` (Next.js 16, Turbopack), `packages/db` (Prisma 7 + SQLite adapter), `packages/shared` (zod schemas).
- **Next.js 16 has breaking changes** — read `node_modules/next/dist/docs/` before writing Next code (see apps/web/AGENTS.md). Notably: `proxy.ts` not `middleware.ts`; `cookies()`/`params`/`searchParams` are async.
- **Auth is enforced in `apps/web/src/lib/auth.ts` (DAL)**, called inside every protected route handler and admin layout. Never rely on proxy.ts for security.
- All API input goes through zod schemas in `packages/shared`. Mutating routes must call `requireSameOrigin(request)`.
- SQLite has no enums — `Review.status` / `User.role` are strings validated by zod.
- Prisma client is generated to `packages/db/src/generated` (gitignored). After schema changes: `npm run db:migrate` then `npm run db:generate`.
- Keep `npm audit` at 0: patched transitive versions are pinned in root package.json `overrides`.
