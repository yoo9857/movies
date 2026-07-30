-- Search the criticism itself, not just its title.
--
-- /search and /api/v1/search matched Review.title and Review.excerpt only, so a
-- phrase from the body of a review — the part someone actually remembers —
-- returned nothing. On a site whose whole product is long-form writing, that is
-- the search working on everything except the writing.
--
-- Same trigram approach as the title indexes in 20260730000100_constraints: the
-- query is `contains` (ILIKE '%…%'), which no B-tree can serve.

CREATE INDEX "Review_content_trgm" ON "Review" USING GIN ("content" gin_trgm_ops);
