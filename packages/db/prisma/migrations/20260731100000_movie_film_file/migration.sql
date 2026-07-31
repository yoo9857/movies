-- The complete film, when the film is free — our copy, our player.
--
-- Wikidata's P10 hangs a video off a film's own item, and for 1,997 films in
-- this library that video is the whole picture: public-domain shorts and the
-- silent canon, sitting on Commons under a licence that lets anyone show them.
-- A review site that can play the film it is reviewing is not a feature TMDB
-- could have sold us — it exists because the material is free, which is the
-- same reason the posters and the portraits are here.
--
-- This is deliberately NOT `trailerFile`. A trailer is an advertisement for a
-- film and a film is not an advertisement for itself; one column holding both
-- would make every page that renders one have to ask which it got.
--
-- Two rules, both inherited rather than invented:
--
--   · The file is ours. Same CHECK as `trailerFile` — our origin, or our
--     bucket's cinepixo/ prefix. Commons serves media generously and we still
--     do not hotlink it: a URL we do not control is a page that breaks when
--     someone renames a file.
--   · A licence without a source is refused. Public domain still gets its
--     Commons file page recorded, because "why is this free" is a question the
--     page has to be able to answer.

ALTER TABLE "Movie" ADD COLUMN "filmFile" TEXT;
ALTER TABLE "Movie" ADD COLUMN "filmFileCredit" TEXT;
ALTER TABLE "Movie" ADD COLUMN "filmFileLicense" TEXT;
ALTER TABLE "Movie" ADD COLUMN "filmFileLicenseUrl" TEXT;
ALTER TABLE "Movie" ADD COLUMN "filmFileSourceUrl" TEXT;
-- Seconds. Rendered as "1:47:12" next to the play control, so a viewer knows
-- whether they are being offered a six-minute cartoon or a feature.
ALTER TABLE "Movie" ADD COLUMN "filmFileDuration" INTEGER;

ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_filmFile_is_ours"
  CHECK (
    "filmFile" IS NULL
    OR "filmFile" ~ '^/'
    OR "filmFile" ~ '^https://pokemon-dive\.us-lax-4\.linodeobjects\.com/cinepixo/'
  );

ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_filmFile_license_has_source"
  CHECK ("filmFileLicense" IS NULL OR "filmFileSourceUrl" IS NOT NULL);

-- A duration without a file is a number about nothing.
ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_filmFile_duration_needs_file"
  CHECK ("filmFileDuration" IS NULL OR "filmFile" IS NOT NULL);
