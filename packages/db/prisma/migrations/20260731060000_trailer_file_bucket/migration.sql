-- The trailer file moves to our bucket.
--
-- The owner's Linode Object Storage bucket now carries the video files; the
-- app serves everything else exactly as before. The constraint names the one
-- bucket host we own rather than allowing https:// at large — a trailer URL
-- is either our origin or our bucket, and anything else is a hotlink this
-- schema has refused since the first image column.

ALTER TABLE "Movie" DROP CONSTRAINT "Movie_trailerFile_is_local";

ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_trailerFile_is_ours"
  CHECK (
    "trailerFile" IS NULL
    OR "trailerFile" ~ '^/'
    OR "trailerFile" ~ '^https://pokemon-dive\.us-lax-4\.linodeobjects\.com/'
  );
