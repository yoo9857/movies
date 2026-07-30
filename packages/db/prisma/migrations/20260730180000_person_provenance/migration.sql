-- Provenance for people: where a fact came from, and who owns the photograph.
--
-- The site's own prose (`bio`, `notes`) stays untouched by any importer. What
-- these columns hold is the opposite: the facts anyone can look up, plus the
-- credit a Commons image obliges us to carry. An image with no attribution is a
-- claim we cannot back, so the credit lives beside the object rather than in
-- someone's memory.

ALTER TABLE "Person"
  ADD COLUMN "occupations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "wikidataId" TEXT,
  ADD COLUMN "wikipediaUrl" TEXT,
  ADD COLUMN "imdbId" TEXT,
  ADD COLUMN "imageCredit" TEXT,
  ADD COLUMN "imageLicense" TEXT,
  ADD COLUMN "imageLicenseUrl" TEXT,
  ADD COLUMN "imageSourceUrl" TEXT;

-- One person per Wikidata entity: two rows claiming the same Q-id is a merge
-- someone forgot to do, and it would make re-enrichment ambiguous.
CREATE UNIQUE INDEX "Person_wikidataId_key" ON "Person"("wikidataId");

-- Q-ids have a fixed shape; a typo should fail loudly rather than silently
-- never matching anything upstream.
ALTER TABLE "Person"
  ADD CONSTRAINT "Person_wikidataId_shape" CHECK ("wikidataId" IS NULL OR "wikidataId" ~ '^Q[1-9][0-9]*$');

ALTER TABLE "Person"
  ADD CONSTRAINT "Person_imdbId_shape" CHECK ("imdbId" IS NULL OR "imdbId" ~ '^nm[0-9]{4,12}$');
