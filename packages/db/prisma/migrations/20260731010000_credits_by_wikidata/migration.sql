-- Credits that came from Wikidata, and a way to rank what to fill in next.
--
-- Both credit tables required a TMDB person id, and the linker that turns
-- credits into Person rows resolved identity by that id alone. That was correct
-- while every credit came from one API; it makes Wikidata credits impossible to
-- attach to a person, which is the whole point of importing them — the People
-- section of this site grows from credits, and portraits are then filled from
-- Wikipedia, which needs no key either.
--
-- So: the TMDB id becomes optional, and a Wikidata person id sits beside it.
-- Neither is authoritative; whichever a credit has is what identifies it.

ALTER TABLE "MovieCast" ALTER COLUMN "tmdbPersonId" DROP NOT NULL;
ALTER TABLE "MovieCrew" ALTER COLUMN "tmdbPersonId" DROP NOT NULL;

ALTER TABLE "MovieCast" ADD COLUMN "wikidataPersonId" TEXT;
ALTER TABLE "MovieCrew" ADD COLUMN "wikidataPersonId" TEXT;

CREATE INDEX "MovieCast_wikidataPersonId_idx" ON "MovieCast"("wikidataPersonId");
CREATE INDEX "MovieCrew_wikidataPersonId_idx" ON "MovieCrew"("wikidataPersonId");

ALTER TABLE "MovieCast"
  ADD CONSTRAINT "MovieCast_wikidataPersonId_shape"
  CHECK ("wikidataPersonId" IS NULL OR "wikidataPersonId" ~ '^Q[1-9][0-9]*$');
ALTER TABLE "MovieCrew"
  ADD CONSTRAINT "MovieCrew_wikidataPersonId_shape"
  CHECK ("wikidataPersonId" IS NULL OR "wikidataPersonId" ~ '^Q[1-9][0-9]*$');

-- How many Wikipedia editions wrote about a film: the notability signal the bulk
-- import already filters on, kept so every later backfill — credits now, posters
-- when there is a credential — can work through the library in the order that
-- matters instead of alphabetically.
ALTER TABLE "Movie" ADD COLUMN "wikidataSitelinks" INTEGER;

ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_wikidataSitelinks_nonneg"
  CHECK ("wikidataSitelinks" IS NULL OR "wikidataSitelinks" >= 0);

CREATE INDEX "Movie_wikidataSitelinks_idx" ON "Movie"("wikidataSitelinks" DESC NULLS LAST);
