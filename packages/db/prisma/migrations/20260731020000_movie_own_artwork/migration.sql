-- Artwork a film has here that is ours to serve.
--
-- `posterPath` is a TMDB path: a fragment their CDN completes, useless for
-- anything else, and the library now fills from Wikidata where no TMDB path
-- exists. Some of those films do have a real, freely licensed poster or still on
-- Commons — measured: 11,909 with an image claim and 2,467 with a poster claim,
-- out of 188,486. Those can be fetched once, re-encoded to the sizes this site
-- serves, and stored on our own origin.
--
-- Which is the whole point of the columns beside it. A free licence is a licence
-- with terms: attribution, and a link to the licence itself. A site that keeps
-- the picture and drops the credit has not used a free licence, it has taken a
-- photograph. So the credit travels with the file, exactly as it does for a
-- person's portrait.
--
-- The remaining ~94% have no lawful keyless source: a theatrical poster is
-- copyrighted, and the ones on Wikipedia are non-free uploads carrying a fair-use
-- rationale for that article alone. They are not ours to re-host, and this schema
-- has nowhere to put them, deliberately.

ALTER TABLE "Movie" ADD COLUMN "image" TEXT;
ALTER TABLE "Movie" ADD COLUMN "imageCredit" TEXT;
ALTER TABLE "Movie" ADD COLUMN "imageLicense" TEXT;
ALTER TABLE "Movie" ADD COLUMN "imageLicenseUrl" TEXT;
ALTER TABLE "Movie" ADD COLUMN "imageSourceUrl" TEXT;

-- An image we host is served from our own origin, so it is a path, not a URL to
-- somewhere else. The check keeps a hotlink from being stored here by accident —
-- which is exactly how a non-free poster would end up on the page.
ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_image_is_local"
  CHECK ("image" IS NULL OR "image" ~ '^/');

-- Credit is not optional when there is a file to credit.
ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_image_has_provenance"
  CHECK ("image" IS NULL OR "imageSourceUrl" IS NOT NULL);
