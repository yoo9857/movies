-- The trailers settle on pokemon-dive, the owner's media bucket.
--
-- Osaka was the stopgap that proved the shape; the owner's chosen bucket is
-- pokemon-dive (us-lax-4), now writable with its own scoped key and publicly
-- readable under its existing bucket policy. Same rule as ever, final host:
-- a trailer URL is our origin or our bucket's cinepixo/ prefix, nothing else.

ALTER TABLE "Movie" DROP CONSTRAINT "Movie_trailerFile_is_ours";

-- Rows pointing at the stopgap move with the constraint, or adding it fails.
UPDATE "Movie"
SET "trailerFile" = replace(
  "trailerFile",
  'https://oneday-trading-assets.jp-osa-1.linodeobjects.com/',
  'https://pokemon-dive.us-lax-4.linodeobjects.com/'
)
WHERE "trailerFile" LIKE 'https://oneday-trading-assets.jp-osa-1.linodeobjects.com/%';

ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_trailerFile_is_ours"
  CHECK (
    "trailerFile" IS NULL
    OR "trailerFile" ~ '^/'
    OR "trailerFile" ~ '^https://pokemon-dive\.us-lax-4\.linodeobjects\.com/cinepixo/'
  );
