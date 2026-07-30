-- Where a film's synopsis came from, and what language the film is in.
--
-- The seeded films carry TMDB's synopsis. The 115,000 imported from Wikidata
-- carry none, and a film page without one is a table of facts — which is exactly
-- what the pages that *do* have one are not. Wikipedia has an article for every
-- film in that set (three language editions is the bar they were imported on), so
-- there is a synopsis to be had for effectively all of them.
--
-- It is not free, though: Wikipedia's prose is CC BY-SA, which requires the
-- author (the article), a link to the licence, and share-alike. So the text does
-- not arrive anonymously — the article URL and the licence are stored beside it
-- and rendered under it, and `Movie.overview` stops being a column whose source
-- the reader has to guess. TMDB rows say TMDB; Wikipedia rows say Wikipedia.
--
-- `originalLanguage` is separate but arrives in the same pass: the JSON-LD has
-- carried `inLanguage: undefined` with a comment saying asserting "en" for every
-- film would lie, and Wikidata knows the answer for 107,609 of them.

ALTER TABLE "Movie" ADD COLUMN "originalLanguage" TEXT;
ALTER TABLE "Movie" ADD COLUMN "wikipediaUrl" TEXT;
ALTER TABLE "Movie" ADD COLUMN "overviewSourceUrl" TEXT;
ALTER TABLE "Movie" ADD COLUMN "overviewLicense" TEXT;

-- A synopsis under a share-alike licence without its source is a licence
-- violation, not a missing field. The constraint makes that unrepresentable.
ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_overview_license_has_source"
  CHECK ("overviewLicense" IS NULL OR "overviewSourceUrl" IS NOT NULL);
