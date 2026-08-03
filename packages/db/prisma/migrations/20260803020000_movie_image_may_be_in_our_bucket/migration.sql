-- A poster may live in our bucket, not only on our disk.
--
-- `Movie_image_is_local` was written when "ours" and "on this filesystem" were
-- the same sentence: the column took `^/` and nothing else, and the comment
-- explains why — "the check keeps a hotlink from being stored here by accident,
-- which is exactly how a non-free poster would end up on the page".
--
-- That reason is untouched. What changed is where our own files live. The local
-- driver carried the poster and portrait passes onto the server's root
-- filesystem — 62,374 posters on a disk shared with ten other services, tarred
-- whole every night — so uploads are moving to the bucket, and the constraint as
-- written refuses every migrated row.
--
-- So it widens to the shape `trailerFile` and `filmFile` have used since they
-- were added: our origin, or our bucket's cinepixo/ prefix. A hotlink is still
-- refused, which is the whole point of having this. The bucket host is spelled
-- out rather than pattern-matched for the same reason it is spelled out there —
-- "any https URL" would readmit exactly what this forbids.
ALTER TABLE "Movie" DROP CONSTRAINT "Movie_image_is_local";

ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_image_is_ours"
  CHECK (
    "image" IS NULL
    OR "image" ~ '^/'
    OR "image" ~ '^https://pokemon-dive\.us-lax-4\.linodeobjects\.com/cinepixo/'
  );
