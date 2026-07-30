-- People become entities this site owns.
--
-- Cast and crew were loose rows carrying a name and a TMDB path, so one actor
-- across five films was five unconnected records — nowhere to hang a photo we
-- control, a biography we wrote, or a page that gathers the criticism on them.
--
-- The backfill derives one Person per distinct tmdbPersonId from the credits
-- already stored, then points those credits at it. Done in SQL so `migrate
-- deploy` leaves no window where the table exists and is empty.
--
-- Ids are uuids here rather than cuids: Prisma's @default(cuid()) only applies
-- to rows Prisma inserts, and the id is an opaque internal key — the slug is
-- the public identity, so the format of the key is not load-bearing.

CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tmdbId" INTEGER,
    "image" TEXT,
    "tmdbProfilePath" TEXT,
    "bio" TEXT,
    "notes" TEXT,
    "birthDate" DATE,
    "deathDate" DATE,
    "birthPlace" TEXT,
    "links" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- One row per distinct person, from every credit we already hold.
--
-- Identity is the real TMDB id when there is one, and the normalised name
-- otherwise. The "otherwise" is not hypothetical: the hand-written library
-- seeds store `tmdbPersonId = 0` for every credit, because they were authored
-- as text without an import ever running. Grouping on that column alone would
-- collapse the entire cast of nine films into one person.
--
-- Two genuinely different people sharing a name would merge here. That is the
-- accepted cost of deriving identity from seed data; once a real TMDB import
-- runs, `tmdbId` separates them and the refresh links by id first.
WITH credits AS (
  SELECT "tmdbPersonId", "name", "profilePath" FROM "MovieCast"
  UNION ALL
  SELECT "tmdbPersonId", "name", "profilePath" FROM "MovieCrew"
),
keyed AS (
  SELECT
    COALESCE(
      NULLIF("tmdbPersonId", 0)::text,
      'name:' || lower(btrim("name"))
    ) AS identity,
    NULLIF("tmdbPersonId", 0) AS tmdb_id,
    "name",
    "profilePath"
  FROM credits
),
people AS (
  SELECT
    identity,
    max(tmdb_id) AS tmdb_id,
    -- The same person can be credited under slightly different spellings;
    -- the most frequent one is the house spelling.
    mode() WITHIN GROUP (ORDER BY "name") AS name,
    -- Any profile path we have seen, as a seed for the first photo import.
    (array_agg("profilePath") FILTER (WHERE "profilePath" IS NOT NULL))[1] AS profile_path
  FROM keyed
  GROUP BY identity
),
slugged AS (
  SELECT
    identity,
    tmdb_id,
    name,
    profile_path,
    -- Same grammar as movie and review slugs. A name that romanises to nothing
    -- (an all-CJK credit with no Latin form) becomes "person", then -2, -3…
    COALESCE(
      NULLIF(trim(BOTH '-' FROM regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''),
      'person'
    ) AS candidate
  FROM people
),
numbered AS (
  SELECT
    identity, tmdb_id, name, profile_path, candidate,
    row_number() OVER (PARTITION BY candidate ORDER BY identity) AS rn
  FROM slugged
)
INSERT INTO "Person" ("id", "slug", "name", "tmdbId", "tmdbProfilePath", "updatedAt")
SELECT
  gen_random_uuid()::text,
  candidate || CASE WHEN rn > 1 THEN '-' || rn ELSE '' END,
  name,
  tmdb_id,
  profile_path,
  CURRENT_TIMESTAMP
FROM numbered;

CREATE UNIQUE INDEX "Person_slug_key" ON "Person"("slug");
CREATE UNIQUE INDEX "Person_tmdbId_key" ON "Person"("tmdbId");
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- Same shape rule as every other public slug on the site.
ALTER TABLE "Person"
  ADD CONSTRAINT "Person_slug_shape" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- A death cannot precede a birth; both are optional.
ALTER TABLE "Person"
  ADD CONSTRAINT "Person_lifespan_ordered" CHECK (
    "birthDate" IS NULL OR "deathDate" IS NULL OR "deathDate" >= "birthDate"
  );

-- Point the existing credits at their person.
ALTER TABLE "MovieCast" ADD COLUMN "personId" TEXT;
ALTER TABLE "MovieCrew" ADD COLUMN "personId" TEXT;

-- Match on the same identity rule the insert used: real id first, name second.
UPDATE "MovieCast" c SET "personId" = p."id"
FROM "Person" p
WHERE (c."tmdbPersonId" <> 0 AND p."tmdbId" = c."tmdbPersonId")
   OR (c."tmdbPersonId" = 0 AND p."tmdbId" IS NULL AND lower(p."name") = lower(btrim(c."name")));

UPDATE "MovieCrew" c SET "personId" = p."id"
FROM "Person" p
WHERE (c."tmdbPersonId" <> 0 AND p."tmdbId" = c."tmdbPersonId")
   OR (c."tmdbPersonId" = 0 AND p."tmdbId" IS NULL AND lower(p."name") = lower(btrim(c."name")));

-- SetNull, not Cascade: deleting a person must not silently erase the fact that
-- a film had that credit.
ALTER TABLE "MovieCast" ADD CONSTRAINT "MovieCast_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MovieCrew" ADD CONSTRAINT "MovieCrew_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MovieCast_personId_idx" ON "MovieCast"("personId");
CREATE INDEX "MovieCrew_personId_idx" ON "MovieCrew"("personId");

-- Case-insensitive name search, like the film and review titles.
CREATE INDEX "Person_name_trgm" ON "Person" USING GIN ("name" gin_trgm_ops);
