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

The keyless CinePixo media lanes use the film's own identities and sources:
`npm run posters` reads its Wikipedia article, `npm run db:import-trailers`
reads Wikidata trailer claims, and `npm run db:import-site-trailers` checks the
film's official site. Archive or rights-holder artwork researched by an
operator goes through `npm run posters -- --sources=../../deploy-jobs/movie-artwork-sources.json`.
Each sourced job must name a matching Wikidata or IMDb identity and carries its
credit, rights statement, and source page into the movie row.
Official trailers researched directly from a distributor or studio channel go
through `npm run db:import-trailers -- --sources=../../deploy-jobs/movie-trailer-sources.json`.
That lane rechecks the live YouTube title and channel through oEmbed, rejects
clips and identity mismatches, and only then marks the video official.

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

## The blog (`/blog` — "Off Camera")

Reviews cover one axis well: an argument about a single film, scored and signed by
a member. They are the wrong shape for everything a reader searches for *around* a
film — what an actor is doing away from it, why a casting decision started a row,
which five films to watch before the sequel. That is what the blog is for, and it
is **editorial**: written by the desk, not by members, with no rating column
anywhere in the schema. A piece that scores a film is a review filed under the
wrong URL, and leaving the column out is what keeps that mistake from being one
line of code away.

Five shelves (`PostCategory`), at `/blog/category/{people,issue,industry,craft,watchlist}`:

| Shelf | What goes on it |
| --- | --- |
| **Away From Set** (`PEOPLE`) | The people who make films, away from the film. Not called "Off Camera" — that is the blog's own name, and reusing it gave the front and the shelf the same heading |
| **The Argument** (`ISSUE`) | A live controversy, explained |
| **Industry** (`INDUSTRY`) | Production, box office, festivals, awards |
| **Craft** (`CRAFT`) | Camera, cutting, score, design |
| **Watchlist** (`WATCHLIST`) | What to watch, and in what order |

Posts themselves stay flat at `/blog/{slug}`. The shelf gets the extra segment,
not the post, because a slug is the piece's public identity and must not move when
it is recategorised — the same rule film slugs follow. `RESERVED_POST_SLUGS` keeps
a post from claiming `category`, which would publish it at a URL nothing can reach.

**Sources are enforced, not encouraged.** A `PEOPLE` or `ISSUE` post is a factual
claim about a living person, so `Post_claims_are_sourced` refuses to let one reach
`PUBLISHED` with an empty `sources` array. `CRAFT` and `WATCHLIST` are our own
reading of films we have watched and need nothing. The same rule appears in four
more places, and they have to stay in step:

- `SOURCED_CATEGORIES` and a zod `.refine()` in `packages/shared`, so the failure
  is a sentence on the `sources` field rather than a 500 from the database
- the editor, which disables Publish and says why
- the post page, the `.md` rendition, `feed.json` and `llms.txt`, all of which
  print every URL — a citation the database demands and a surface hides is a lie
  told to the schema

**The link graph is the reason it is worth building next to a library.**
`PostPerson` and `PostMovie` are ordered join tables: a post renders links to our
own person and film pages, and those pages render the post back (`subjectOf` in the
person's JSON-LD). The first subject becomes `about` in the post's markup and the
rest become `mentions`, so a profile of one actor does not claim to be equally
about the films listed under it.

Drafts are readable at their own URL by an admin — `noindex`, no view count, no
`BlogPosting` node, on no shelf and in no feed. A piece making a claim about a real
person should be proofread on the page, not by publishing it and looking.

Written at `/admin/blog`, on the same Tiptap surface as reviews (markdown stays the
storage format). The hero image goes through `lib/media/`; `Post_image_is_ours`
refuses anything that is not on our origin or in our bucket, and a licence without
its source is refused too.

**Writing them from sources** — `npm run db:write-posts`, the sibling of
`db:write-reviews`:

```bash
npm run db:write-posts -- --sources=jobs.json            # a post per source, as DRAFT
npm run db:write-posts -- --sources=jobs.json --dry      # generate, print, write nothing
npm run db:write-posts -- --sources=jobs.json --publish  # opt in to going live now
npm run db:write-posts -- --drafts=prose.json            # prose written elsewhere, same checks
```

A review is generated from facts the library already owns. A post about a person
is the opposite — every fact comes from somewhere else — so a source is the unit of
work here, not optional input:

```json
[{
  "sources": ["https://example.com/report"],
  "category": "ISSUE",
  "brief": "The facts, pasted. Required when the source cannot be fetched.",
  "angle": "optional: the line the desk wants, in one sentence",
  "people": ["bong-joon-ho"],
  "films": ["parasite-2019"]
}]
```

It lands `DRAFT` unless `--publish` is passed. `Post_claims_are_sourced` can prove
a citation exists; nothing in a database can prove the prose above it is faithful
to that citation, and for a piece about a living person that gap is the whole risk
— so the default is a draft waiting at its own URL for someone to read it against
its sources. `brief` is the field that makes this usable: Naver and the outlets
syndicated through it refuse automated fetches from some clients, so the operator
pastes the facts and the URL stays as the citation the page prints. Generation goes
through `codex exec`, which is installed on the server rather than locally.

## API (v1)

Public: `GET /api/v1/reviews`, `GET /api/v1/reviews/:slug`, `GET /api/v1/critics`, `GET /api/v1/critics/:slug`, `GET /api/v1/movies`
Auth: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
Authors: `POST /api/v1/my/review-images` — multipart image upload for review bodies (probed, re-encoded to WebP, EXIF stripped)
Admin: `GET|POST /api/v1/admin/reviews`, `GET|PUT|DELETE /api/v1/admin/reviews/:id`, `GET|POST /api/v1/admin/posts`, `GET|PUT|DELETE /api/v1/admin/posts/:id`, `GET /api/v1/admin/people/lookup?q=` (our own rows, unlike `.../people/search` which asks TMDB), `GET /api/v1/admin/tmdb/search?q=`, `POST /api/v1/admin/movies/import`

A future native app consumes the same `/api/v1` endpoints.

## SEO and GEO

Set **`NEXT_PUBLIC_SITE_URL`** before deploying. Every canonical, Open Graph URL,
sitemap entry and JSON-LD `@id` is derived from it; left at its default, production
declares its canonical home to be `localhost`.

**Machine-readable surfaces**

| URL | What it is |
| --- | --- |
| `/robots.txt` | Crawl policy; search and assistant agents named explicitly |
| `/sitemap.xml` | Sitemap **index** → `/sitemaps/{pages,reviews,blog,movies,people,topics,critics}.xml`. Styled via XSL: a browser shows a folder listing and per-section tables, crawlers see standard XML |
| `/feed.xml` | RSS 2.0 — full text via `content:encoded`; styled via XSL for humans |
| `/feed.json` | JSON Feed 1.1 — same content, real author objects, ratings |
| `/ads.txt` | Authorised ad sellers (IAB format), derived from the same env var as the AdSense meta tag |
| `/llms.txt` | What the site is, what its ratings mean, and what a theme and a motif mean here, for language models |
| `/llms-full.txt` | The editorial taxonomy in full, then the full text of every published review, as one document |
| `/reviews/{slug}.md` | One review as clean Markdown with YAML front matter |
| `/movies/{slug}.md` | One film: credits (linked to people pages), cast, and the criticism on it |
| `/people/{slug}.md` | One person: sourced facts, filmography with this site's ratings, the criticism |
| `/topics/{slug}.md` | One theme or motif: the definition, the essay, and every film under it with the sentence that placed it there |
| `/blog/{slug}.md` | One blog post: the standfirst, the piece, who and what it is about — and its sources, in the front matter *and* the body |

The `.md` URLs are rewrites onto `/md/*` handlers (see `next.config.ts`) and are
advertised from each page as `rel="alternate" type="text/markdown"`.

**Structured data** — `src/lib/seo.ts` builds one `@graph` per page from nodes that
reference each other by `@id`, so a crawler resolves one Organization, one film and
one review across the whole site rather than a fresh copy per URL. `Review`,
`Movie`, `Person`, `DefinedTerm`, `DefinedTermSet`, `Blog`, `BlogPosting`,
`BreadcrumbList`, `ItemList`, `FAQPage` and `Dataset` are all emitted. A film page carries its themes and
motifs as `about` **references** to those `DefinedTerm` ids — the definitions
themselves live on the topic pages that render them. Two rules hold everywhere:

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
- CSP minted per request in `proxy.ts` around a fresh nonce (`src/lib/csp.ts`): `script-src` is `'nonce-…' 'strict-dynamic'`, never a host list — the shape AdSense documents as the only supported one. HSTS, nosniff, frame-deny stay static in `next.config.ts`
- Markdown rendered by react-markdown — raw HTML never reaches the DOM
- zod validation on every input; identical errors for unknown email vs wrong password
- `npm audit`: 0 vulnerabilities (patched transitives pinned via `overrides`)
