-- The trailer bucket turns out to live in Osaka.
--
-- The LA bucket the previous constraint named is closed to the keys this
-- server holds (bucket-scoped credentials, 403); the account's writable
-- bucket sits in jp-osa-1 — which is also simply the better region for a
-- site whose viewers are mostly in Korea. Same rule, corrected host: a
-- trailer URL is our origin or our bucket, nothing else.

ALTER TABLE "Movie" DROP CONSTRAINT "Movie_trailerFile_is_ours";

ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_trailerFile_is_ours"
  CHECK (
    "trailerFile" IS NULL
    OR "trailerFile" ~ '^/'
    OR "trailerFile" ~ '^https://oneday-trading-assets\.jp-osa-1\.linodeobjects\.com/cinepixo/'
  );
