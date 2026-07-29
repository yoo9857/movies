# CinePixo

A fandom home for lovers of film criticism — fans write reviews, rate films, and celebrate the critics who taught us how to watch movies.

## Stack

- **Next.js 16.2** (App Router, Turbopack) — site + admin + REST API in one app
- **Prisma 7** + SQLite (dev) via driver adapter — swap `DATABASE_URL` + adapter for PostgreSQL in production
- **zod 4** — every API input validated
- **jose** JWT sessions in httpOnly cookies, **scrypt** (node:crypto) password hashing
- **TMDB** integration for movie metadata
- npm workspaces monorepo:

```
apps/web            Next.js app (public site, /admin, /api/v1)
packages/db         Prisma schema, client, password hashing
packages/shared     zod schemas + types shared with a future native app
```

## Getting started

```bash
npm install
npm run db:migrate       # create/upgrade the dev SQLite DB
npm run db:seed          # admin user + sample data (prints admin password ONCE if ADMIN_PASSWORD unset)
npm run dev              # http://localhost:3000
```

Copy `.env.example` values into `apps/web/.env.local`:

- `SESSION_SECRET` — long random string (required)
- `TMDB_API_KEY` — enables movie search/import in the admin

Admin lives at `/admin` (login with the seeded credentials).

## API (v1)

Public: `GET /api/v1/reviews`, `GET /api/v1/reviews/:slug`, `GET /api/v1/critics`, `GET /api/v1/critics/:slug`, `GET /api/v1/movies`
Auth: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
Admin: `GET|POST /api/v1/admin/reviews`, `GET|PUT|DELETE /api/v1/admin/reviews/:id`, `GET /api/v1/admin/tmdb/search?q=`, `POST /api/v1/admin/movies/import`

A future native app consumes the same `/api/v1` endpoints.

## Security posture

- Auth enforced in the **data access layer** (`src/lib/auth.ts`) inside every protected route/page — `proxy.ts` is a convenience redirect only (lesson of CVE-2025-29927)
- scrypt password hashes (memory-hard, constant-time verify), no default credentials
- JWT sessions: httpOnly + SameSite=Lax cookies, HS256 pinned, fresh DB role check per request
- CSRF: SameSite cookie + Origin header check on all mutations
- Rate limiting on login (per-IP and per-account), TMDB proxy routes
- CSP, HSTS, nosniff, frame-deny headers; `poweredByHeader` off
- Markdown rendered by react-markdown — raw HTML never reaches the DOM
- zod validation on every input; identical errors for unknown email vs wrong password
- `npm audit`: 0 vulnerabilities (patched transitives pinned via `overrides`)
