-- Movies get a URL slug: title-year ("parasite-2019"), unique.
--
-- Backfilled here rather than by application code, so `migrate deploy` leaves
-- no window where the column exists but rows are NULL. The generation mirrors
-- @cinepixo/shared movieSlug(): lowercase, non-alphanumerics to hyphens,
-- release year appended, "film" when a title romanises to nothing. Collisions
-- take -2, -3… by creation order, so the oldest movie keeps the clean slug.

ALTER TABLE "Movie" ADD COLUMN "slug" TEXT;

WITH base AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        trim(BOTH '-' FROM regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g')),
        ''
      ),
      'film'
    )
    || CASE
         WHEN "releaseDate" IS NOT NULL
         THEN '-' || extract(YEAR FROM "releaseDate")::int
         ELSE ''
       END AS candidate,
    "createdAt"
  FROM "Movie"
),
numbered AS (
  SELECT
    id,
    candidate,
    row_number() OVER (PARTITION BY candidate ORDER BY "createdAt", id) AS rn
  FROM base
)
UPDATE "Movie" m
SET "slug" = n.candidate || CASE WHEN n.rn > 1 THEN '-' || n.rn ELSE '' END
FROM numbered n
WHERE m.id = n.id;

ALTER TABLE "Movie" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Movie_slug_key" ON "Movie"("slug");

-- Same shape rule the router and zod enforce for review slugs.
ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_slug_shape" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
