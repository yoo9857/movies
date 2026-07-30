-- Topics & motifs: the editorial axes of the library.
--
-- A theme is what a film is about (class divide, the cost of ambition); a
-- motif is what recurs on screen (stairs, mirrors, one continuous take).
-- TMDB keywords describe one film in isolation — a topic connects films to
-- each other, in our voice, which is why nothing in these tables is ever
-- filled from an API.

CREATE TYPE "TopicKind" AS ENUM ('THEME', 'MOTIF');

CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TopicKind" NOT NULL,
    "description" TEXT,
    "essay" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Topic_slug_key" ON "Topic"("slug");
CREATE INDEX "Topic_kind_idx" ON "Topic"("kind");
CREATE INDEX "Topic_name_idx" ON "Topic"("name");

-- Same shape rule as every other public slug on the site.
ALTER TABLE "Topic"
  ADD CONSTRAINT "Topic_slug_shape" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Two topics differing only in case are the same editorial idea twice; the
-- application searches case-insensitively, so the database must agree.
CREATE UNIQUE INDEX "Topic_name_lower_key" ON "Topic" (LOWER("name"));

-- Case-insensitive name search, like films, reviews and people.
CREATE INDEX "Topic_name_trgm" ON "Topic" USING GIN ("name" gin_trgm_ops);

CREATE TABLE "MovieTopic" (
    "movieId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovieTopic_pkey" PRIMARY KEY ("movieId", "topicId")
);

CREATE INDEX "MovieTopic_topicId_idx" ON "MovieTopic"("topicId");

ALTER TABLE "MovieTopic" ADD CONSTRAINT "MovieTopic_movieId_fkey"
  FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovieTopic" ADD CONSTRAINT "MovieTopic_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A note is one editorial sentence, not an essay — and never saved as
-- whitespace pretending to be content.
ALTER TABLE "MovieTopic"
  ADD CONSTRAINT "MovieTopic_note_meaningful" CHECK (
    "note" IS NULL OR (btrim("note") <> '' AND char_length("note") <= 500)
  );
