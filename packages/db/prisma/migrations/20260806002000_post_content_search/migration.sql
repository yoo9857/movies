-- Search the posts, not just their headlines.
--
-- Exactly the argument made for `Review_content_trgm`: the phrase someone
-- remembers is in the body, and a site whose product is writing cannot have a
-- search that works on everything except the writing. It applies harder here —
-- a reader looking for a piece about an actor rarely remembers the headline,
-- which is usually a claim rather than a name.
--
-- `dek` gets one too. It is the sentence most likely to be quoted back to us,
-- because it is the sentence search results and share cards show.

CREATE INDEX "Post_content_trgm" ON "Post" USING GIN ("content" gin_trgm_ops);
CREATE INDEX "Post_dek_trgm" ON "Post" USING GIN ("dek" gin_trgm_ops);

-- The tags are a curated list a reader can see on the page, so a tag search is
-- an equality test against an array, not a substring scan. GIN over the array is
-- what serves `tags: { has: … }`. Named the way Prisma names it (`Movie_genres_idx`
-- is the precedent), because the model declares it too and a different name here
-- would read as schema drift on the next migration.
CREATE INDEX "Post_tags_idx" ON "Post" USING GIN ("tags");
