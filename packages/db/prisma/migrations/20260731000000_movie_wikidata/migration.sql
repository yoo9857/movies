-- Where a film's facts came from, when they did not come from TMDB.
--
-- The library is about to be filled from Wikidata, which needs no API key and
-- carries something TMDB cannot: a citable identity per claim. Storing the QID
-- makes every imported film traceable to the item it was read from, and makes
-- the import idempotent without depending on titles — two films share a title
-- and a year more often than anyone expects.
--
-- Nullable and unique: hand-created films and TMDB imports have no QID, and no
-- two rows may claim the same one.

ALTER TABLE "Movie" ADD COLUMN "wikidataId" TEXT;

CREATE UNIQUE INDEX "Movie_wikidataId_key" ON "Movie"("wikidataId");

-- Shape check: Q followed by digits, as Wikidata mints them.
ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_wikidataId_shape" CHECK ("wikidataId" IS NULL OR "wikidataId" ~ '^Q[1-9][0-9]*$');

-- The sitemap and the indexing gate both ask "does this film carry any of our
-- own writing?", which means a review lookup by movie and status, and a topic
-- assignment lookup by movie. The second has no index yet: MovieTopic is keyed
-- (movieId, topicId) so the leading column serves it, but the review side wants
-- this composite to avoid a scan per film once the library is six figures.
CREATE INDEX IF NOT EXISTS "Review_movieId_status_idx" ON "Review"("movieId", "status");
