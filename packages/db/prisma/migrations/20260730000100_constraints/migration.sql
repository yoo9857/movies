-- Invariants the application also enforces, restated where they cannot be
-- bypassed. A bug in a route handler, a hand-written UPDATE during an
-- incident, or a future migration all go through these.

-- Ratings: 0–10 in half-point steps. The multiplication avoids floating point
-- surprises that (rating * 2) % 1 = 0 would hit.
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_range" CHECK ("rating" >= 0 AND "rating" <= 10),
  ADD CONSTRAINT "Review_rating_step" CHECK (("rating" * 2) = FLOOR("rating" * 2));

-- Counters are counts; they cannot be negative.
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_viewCount_nonneg" CHECK ("viewCount" >= 0),
  ADD CONSTRAINT "Review_helpfulCount_nonneg" CHECK ("helpfulCount" >= 0);

-- A published review must carry its publication date, and a draft must not.
-- This is the pairing the UI relies on when it sorts feeds.
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_published_has_date" CHECK (
    ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL)
    OR ("status" = 'DRAFT' AND "publishedAt" IS NULL)
  );

-- Slugs appear in URLs; keep the shape that the router and zod agree on.
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_slug_shape" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Critic"
  ADD CONSTRAINT "Critic_slug_shape" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Money and durations are never negative; TMDB reports 0 for "unknown", which
-- the importer already converts to NULL.
ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_budget_nonneg" CHECK ("budget" IS NULL OR "budget" >= 0),
  ADD CONSTRAINT "Movie_revenue_nonneg" CHECK ("revenue" IS NULL OR "revenue" >= 0),
  ADD CONSTRAINT "Movie_runtime_sane" CHECK ("runtime" IS NULL OR ("runtime" >= 0 AND "runtime" <= 1000)),
  ADD CONSTRAINT "Movie_vote_range" CHECK ("voteAverage" IS NULL OR ("voteAverage" >= 0 AND "voteAverage" <= 10));

-- Identity: emails are compared lowercased in the application, so make the
-- uniqueness case-insensitive in the database too. Otherwise Devoh@x.com and
-- devoh@x.com are two accounts that both believe they own the address.
-- Prisma's own unique indexes stay in place — dropping them would read as
-- schema drift on the next migration — these sit alongside them.
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (LOWER("email"));
CREATE UNIQUE INDEX "User_username_lower_key" ON "User" (LOWER("username"));

-- Usernames are handles: the shape the sign-up form promises.
ALTER TABLE "User"
  ADD CONSTRAINT "User_username_shape" CHECK ("username" ~ '^[a-z0-9_]{3,30}$'),
  ADD CONSTRAINT "User_email_shape" CHECK ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- Case-insensitive title search (the /search page uses `contains`), without
-- which every query is a sequential scan once the library grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Movie_title_trgm" ON "Movie" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Review_title_trgm" ON "Review" USING GIN ("title" gin_trgm_ops);
