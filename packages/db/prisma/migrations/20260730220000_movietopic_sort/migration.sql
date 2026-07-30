-- An explicit order for the films under a topic.
--
-- The admin screen sends the whole film list on save, and the endpoint replaced
-- it with a deleteMany + createMany inside one transaction. PostgreSQL's now()
-- is transaction-scoped, so every recreated row received an identical
-- createdAt — and `ORDER BY "createdAt"` then returned the curator's list in an
-- arbitrary order. The seeded rows were upserted one at a time and happened to
-- get distinct timestamps, which is exactly the kind of accident that hides a
-- bug until someone edits a topic.
--
-- Order is curation here (the strip of posters on a card, the sequence an
-- argument is made in), so it gets a column of its own rather than being
-- inferred from a timestamp.

ALTER TABLE "MovieTopic" ADD COLUMN "sort" INTEGER NOT NULL DEFAULT 0;

-- Backfill: keep whatever order the rows currently present, so nothing visibly
-- reshuffles on deploy. movieId breaks ties deterministically.
WITH ranked AS (
  SELECT
    "movieId",
    "topicId",
    ROW_NUMBER() OVER (PARTITION BY "topicId" ORDER BY "createdAt", "movieId") - 1 AS n
  FROM "MovieTopic"
)
UPDATE "MovieTopic" mt
   SET "sort" = ranked.n
  FROM ranked
 WHERE mt."movieId" = ranked."movieId"
   AND mt."topicId" = ranked."topicId";

CREATE INDEX "MovieTopic_topicId_sort_idx" ON "MovieTopic"("topicId", "sort");

-- A negative position is meaningless; the application always sends an index.
ALTER TABLE "MovieTopic"
  ADD CONSTRAINT "MovieTopic_sort_nonneg" CHECK ("sort" >= 0);
