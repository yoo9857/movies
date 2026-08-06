-- The blog: the writing this site does that is not a review.
--
-- Reviews cover one axis well — an argument about a single film, scored. They
-- cannot carry what a reader searches for around a film: what an actor is doing
-- off camera, why a casting decision started a row, which five films to watch
-- before a sequel lands. Those are the queries the library has no page for, and
-- a review is the wrong shape for every one of them.
--
-- Two things here are not conveniences:
--
--  · **no rating column.** A piece that scores a film is a review filed under
--    the wrong URL. Leaving the column out is what keeps that mistake from
--    being one line of code away.
--  · **sources are enforced, not encouraged.** A PEOPLE or ISSUE post makes a
--    factual claim about a living person, who can be harmed by our getting it
--    wrong and can sue us for it. The CHECK below refuses to let such a post
--    reach PUBLISHED with an empty `sources` array. WATCHLIST and CRAFT pieces
--    are our own opinion and need no citation, so they are exempt — the
--    category split exists for this rule, not for the navigation.

CREATE TYPE "PostCategory" AS ENUM ('PEOPLE', 'ISSUE', 'INDUSTRY', 'CRAFT', 'WATCHLIST');

CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dek" TEXT,
    "content" TEXT NOT NULL,
    "category" "PostCategory" NOT NULL,
    -- The same two-state machine as a review, so the same enum. A second type
    -- with identical members would be one more thing to keep in step.
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "tags" TEXT[],
    "sources" TEXT[],
    "image" TEXT,
    "imageCredit" TEXT,
    "imageLicense" TEXT,
    "imageLicenseUrl" TEXT,
    "imageSourceUrl" TEXT,
    "imageAlt" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE INDEX "Post_status_publishedAt_idx" ON "Post"("status", "publishedAt" DESC);
CREATE INDEX "Post_category_status_publishedAt_idx" ON "Post"("category", "status", "publishedAt" DESC);
CREATE INDEX "Post_authorId_updatedAt_idx" ON "Post"("authorId", "updatedAt" DESC);

ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same shape rule as every other public slug on the site.
ALTER TABLE "Post"
  ADD CONSTRAINT "Post_slug_shape" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Two posts differing only in case are the same headline twice, and the admin
-- screen looks for clashes case-insensitively — so the database must agree.
CREATE UNIQUE INDEX "Post_title_lower_key" ON "Post" (LOWER("title"));

-- Case-insensitive headline search, like films, reviews, people and topics.
CREATE INDEX "Post_title_trgm" ON "Post" USING GIN ("title" gin_trgm_ops);

-- A published post carries its publication date and a draft does not. Exactly
-- the pairing "Review_published_has_date" enforces, and for the same reason:
-- every feed and shelf on the site sorts on this column.
ALTER TABLE "Post"
  ADD CONSTRAINT "Post_published_has_date" CHECK (
    ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL)
    OR ("status" = 'DRAFT' AND "publishedAt" IS NULL)
  );

ALTER TABLE "Post"
  ADD CONSTRAINT "Post_viewCount_nonneg" CHECK ("viewCount" >= 0);

-- A headline and a body, or it is not a post. Empty strings pass a NOT NULL and
-- would publish a blank page with a canonical URL.
ALTER TABLE "Post"
  ADD CONSTRAINT "Post_title_meaningful" CHECK (btrim("title") <> '' AND char_length("title") <= 200),
  ADD CONSTRAINT "Post_content_meaningful" CHECK (btrim("content") <> ''),
  ADD CONSTRAINT "Post_dek_meaningful" CHECK (
    "dek" IS NULL OR (btrim("dek") <> '' AND char_length("dek") <= 500)
  );

-- The rule this table was shaped around.
--
-- PEOPLE and ISSUE posts are claims about real, living, litigious people.
-- Publishing one with no citation is the failure mode of every fan blog that
-- has ever been sued, and it is a failure of the writing as much as of the law:
-- a page whose facts cannot be followed is not worth ranking. So the database
-- refuses it. A draft may be empty — that is what drafting is for.
--
-- INDUSTRY is exempt by a hair: box-office and festival results are matters of
-- record the page states plainly, and the editor is asked for a source anyway.
-- CRAFT and WATCHLIST are our own reading of films we have watched.
ALTER TABLE "Post"
  ADD CONSTRAINT "Post_claims_are_sourced" CHECK (
    "status" = 'DRAFT'
    OR "category" NOT IN ('PEOPLE', 'ISSUE')
    OR COALESCE(array_length("sources", 1), 0) >= 1
  );

-- Per-element URL shape is enforced in zod (`postInputSchema`), not here: a
-- CHECK constraint cannot walk an array without a subquery, and PostgreSQL
-- forbids subqueries in CHECK. What is expressible is the count, above.

-- A hero image we host is on our own origin or in our own bucket. Identical to
-- "Movie_image_is_ours", spelled out for the same reason it is spelled out
-- there: "any https URL" would readmit exactly the hotlink this forbids, which
-- is how a photograph we have no licence for reaches the page.
ALTER TABLE "Post"
  ADD CONSTRAINT "Post_image_is_ours"
  CHECK (
    "image" IS NULL
    OR "image" ~ '^/'
    OR "image" ~ '^https://pokemon-dive\.us-lax-4\.linodeobjects\.com/cinepixo/'
  );

-- A licence without its source is refused; an operator's own upload states no
-- licence and so needs none. Same contract as every other file column here.
ALTER TABLE "Post"
  ADD CONSTRAINT "Post_image_license_has_source"
  CHECK ("imageLicense" IS NULL OR "imageSourceUrl" IS NOT NULL);

-- Alt text and credit describe a file; without one there is nothing to describe.
ALTER TABLE "Post"
  ADD CONSTRAINT "Post_imageAlt_needs_image"
  CHECK ("imageAlt" IS NULL OR "image" IS NOT NULL),
  ADD CONSTRAINT "Post_imageCredit_needs_image"
  CHECK ("imageCredit" IS NULL OR "image" IS NOT NULL);

-- ── What a post is about ─────────────────────────────────────────
--
-- These two tables are the point of the blog, not bookkeeping. A piece about an
-- actor links to their page and their page lists the piece; the same for a film.
-- That reciprocal pair is an internal link graph, which is the thing a tag cloud
-- has never been.

CREATE TABLE "PostPerson" (
    "postId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostPerson_pkey" PRIMARY KEY ("postId", "personId")
);

CREATE INDEX "PostPerson_personId_idx" ON "PostPerson"("personId");
CREATE INDEX "PostPerson_postId_sort_idx" ON "PostPerson"("postId", "sort");

ALTER TABLE "PostPerson" ADD CONSTRAINT "PostPerson_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostPerson" ADD CONSTRAINT "PostPerson_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PostMovie" (
    "postId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostMovie_pkey" PRIMARY KEY ("postId", "movieId")
);

CREATE INDEX "PostMovie_movieId_idx" ON "PostMovie"("movieId");
CREATE INDEX "PostMovie_postId_sort_idx" ON "PostMovie"("postId", "sort");

ALTER TABLE "PostMovie" ADD CONSTRAINT "PostMovie_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostMovie" ADD CONSTRAINT "PostMovie_movieId_fkey"
  FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
