-- A hosted trailer's terms, because some of them now arrive under a licence.
--
-- `trailerFile` was built for one owner-supplied mp4 on the billboard, so it
-- needed no paperwork. Commons changes that: Wikidata's P10 turns out to hold
-- the film *or* its trailer, and the trailers are the public-domain theatrical
-- ones for exactly the classics YouTube never gave us a key for — Some Like It
-- Hot, Anatomy of a Murder, The Diary of Anne Frank.
--
-- Same contract as every other imported file here: the credit travels with it
-- and a licence without its source is refused. An operator's own upload states
-- no licence and so needs no source, which is what keeps the billboard's
-- existing row legal.

ALTER TABLE "Movie" ADD COLUMN "trailerFileCredit" TEXT;
ALTER TABLE "Movie" ADD COLUMN "trailerFileLicense" TEXT;
ALTER TABLE "Movie" ADD COLUMN "trailerFileLicenseUrl" TEXT;
ALTER TABLE "Movie" ADD COLUMN "trailerFileSourceUrl" TEXT;
-- Seconds. Also the evidence for calling this a trailer rather than the film:
-- a P10 video that runs the length of the picture is the picture.
ALTER TABLE "Movie" ADD COLUMN "trailerFileDuration" INTEGER;

ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_trailerFile_license_has_source"
  CHECK ("trailerFileLicense" IS NULL OR "trailerFileSourceUrl" IS NOT NULL);

ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_trailerFile_duration_needs_file"
  CHECK ("trailerFileDuration" IS NULL OR "trailerFile" IS NOT NULL);
