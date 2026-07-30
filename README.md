# CinePixo

A fandom home for lovers of film criticism — fans write reviews, rate films, and celebrate the critics who taught us how to watch movies.

## Stack

- **Next.js 16.2** (App Router, Turbopack) — site + admin + REST API in one app
- **Prisma 7** + **PostgreSQL 18** via the `@prisma/adapter-pg` driver adapter — bounded pool, layered statement timeouts, SQLSTATE-classified retries (`ops/postgres/README.md`)
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

Copy `.env.example` to `apps/web/.env.local` and fill it in **first** — every `db:*`
command reads `DATABASE_URL` from there:

- `DATABASE_URL` — PostgreSQL connection string (required; there is no file-based fallback)
- `SESSION_SECRET` — 32+ chars, or the app refuses to start
- `TMDB_API_KEY` — optional; without it the site works but `/admin` movie search and import answer 503

You need a PostgreSQL to point at. On the server it is the container in
`ops/postgres/`; locally, either tunnel to it
(`ssh -N -L 5435:127.0.0.1:5435 oneday-server`) or run your own cluster and
create a `cinepixo` database.

```bash
npm install
npm run db:generate      # Prisma client → packages/db/src/generated (gitignored)
npm run db:deploy        # apply existing migrations (db:migrate to author a new one)
npm run db:seed          # admin user + sample data (prints the password ONCE, on creation only)
npm run db:seed:library  # 9 films with cast, crew and verified artwork — no API key needed
npm run dev              # http://localhost:3000
```

With `TMDB_API_KEY` set, `npm run db:refresh-library` fills in what the seeds
deliberately leave out — every actor's photo, key crew portraits, and artwork
for films that have none. Cast and crew are replaced; curated media is only
ever added to, never overwritten.

Admin lives at `/admin` (login with the seeded credentials). `db:seed` is
idempotent: re-running it leaves an existing admin's password untouched and
prints no banner, so the credential from the first run stays the valid one. Set
`ADMIN_EMAIL` / `ADMIN_PASSWORD` to choose them yourself.

Health, including a real query round trip: `curl -s localhost:3000/api/v1/health`

## Tests

```bash
npm test          # unit — no database, no network, ~2s
npm run test:watch
npm run test:db   # integration — needs DATABASE_URL
```

The split is deliberate. `npm test` covers what can be checked in memory, so it
is cheap enough to run on every save:

| Suite | What it pins |
| --- | --- |
| `packages/shared` | slug shape (a URL and filename boundary), rating steps, `javascript:`/`data:` URL rejection, empty-string normalisation, pagination bounds, heading anchors |
| `packages/db` | scrypt format and verification, malformed-hash handling, SQLSTATE classification, retry policy |
| `apps/web` | Origin checks, error-to-status mapping and what must *not* leak, JSON-LD escaping, session cookie flags and JWT tampering/downgrade/expiry |

`npm run test:db` covers what only exists in PostgreSQL — the CHECK constraints,
`LOWER()` unique indexes and trigram indexes from
`prisma/migrations/*_constraints`. It writes bad rows directly, bypassing zod, so
the claim that the database is the last line of defence is actually tested. Each
file builds a throwaway database from the real migration files and drops it
afterwards; the name is always the configured one suffixed with `_test_*`, so it
cannot touch a development database. Set `TEST_DATABASE_URL` to override.

## API (v1)

Public: `GET /api/v1/reviews`, `GET /api/v1/reviews/:slug`, `GET /api/v1/critics`, `GET /api/v1/critics/:slug`, `GET /api/v1/movies`
Auth: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
Authors: `POST /api/v1/my/review-images` — multipart image upload for review bodies (probed, re-encoded to WebP, EXIF stripped)
Admin: `GET|POST /api/v1/admin/reviews`, `GET|PUT|DELETE /api/v1/admin/reviews/:id`, `GET /api/v1/admin/tmdb/search?q=`, `POST /api/v1/admin/movies/import`

A future native app consumes the same `/api/v1` endpoints.

## SEO and GEO

Set **`NEXT_PUBLIC_SITE_URL`** before deploying. Every canonical, Open Graph URL,
sitemap entry and JSON-LD `@id` is derived from it; left at its default, production
declares its canonical home to be `localhost`.

**Machine-readable surfaces**

| URL | What it is |
| --- | --- |
| `/robots.txt` | Crawl policy; search and assistant agents named explicitly |
| `/sitemap.xml` | Every indexable URL, with posters as image entries |
| `/feed.xml` | RSS 2.0 — full text via `content:encoded`, `atom:link rel=self` |
| `/feed.json` | JSON Feed 1.1 — same content, real author objects, ratings |
| `/llms.txt` | What the site is and what its ratings mean, for language models |
| `/llms-full.txt` | Full text of every published review as one document |
| `/reviews/{slug}.md` | One review as clean Markdown with YAML front matter |
| `/movies/{id}.md` | One film: credits, cast, and the criticism on it |

The `.md` URLs are rewrites onto `/md/*` handlers (see `next.config.ts`) and are
advertised from each page as `rel="alternate" type="text/markdown"`.

**Structured data** — `src/lib/seo.ts` builds one `@graph` per page from nodes that
reference each other by `@id`, so a crawler resolves one Organization, one film and
one review across the whole site rather than a fresh copy per URL. `Review`,
`Movie`, `Person`, `BreadcrumbList`, `ItemList`, `FAQPage` and `Dataset` are all
emitted. Two rules hold everywhere:

- **Never claim what isn't rendered.** `aggregateRating` appears on the film page,
  which shows the aggregate — not on a review page, which shows one score.
- **One script tag per page**, emitted only through `components/JsonLd.tsx`, which
  escapes `<`, `>`, `&` and the U+2028/U+2029 line separators. A review title
  containing `</script>` is otherwise an XSS sink.

**Indexing policy** — `/search` and the authenticated pages are `noindex, follow`;
admin is `noindex, nofollow` in metadata *and* via `X-Robots-Tag`, because a crawler
blocked by robots.txt never reads the tag inside the page. On `/movies`, genre and
decade filters each get their own canonical URL; sort order and view mode
canonicalise away.

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
