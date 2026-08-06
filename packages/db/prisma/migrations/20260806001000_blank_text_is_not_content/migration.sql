-- `btrim(x) <> ''` does not mean "not blank".
--
-- One-argument btrim removes **spaces**. Nothing else. Not tabs, not newlines —
-- so `btrim(E'\n\n')` is `E'\n\n'`, which is not the empty string, which passes.
-- The constraint added with the Post table an hour ago therefore accepted a body
-- consisting of two newlines: a published page with a canonical URL, a share
-- card, a sitemap entry and no writing on it. The constraint test caught it
-- before anything was deployed, which is the entire argument for having written
-- one per constraint.
--
-- The replacement asks the question that was actually meant: does this string
-- contain at least one character that is not whitespace? `[[:space:]]` is
-- POSIX, so it covers the tab and the newline the trim silently let through.
--
-- `MovieTopic_note_meaningful` has carried the same mistake since the topics
-- migration, so it is corrected in the same pass rather than left as a landmine
-- with a different name. Any note that is already whitespace becomes NULL first
-- — "not yet argued" is exactly what NULL means in that column, and adding the
-- constraint over an offending row would fail the migration.

ALTER TABLE "Post" DROP CONSTRAINT "Post_title_meaningful";
ALTER TABLE "Post" DROP CONSTRAINT "Post_content_meaningful";
ALTER TABLE "Post" DROP CONSTRAINT "Post_dek_meaningful";

ALTER TABLE "Post"
  ADD CONSTRAINT "Post_title_meaningful" CHECK (
    "title" ~ '[^[:space:]]' AND char_length("title") <= 200
  ),
  ADD CONSTRAINT "Post_content_meaningful" CHECK ("content" ~ '[^[:space:]]'),
  ADD CONSTRAINT "Post_dek_meaningful" CHECK (
    "dek" IS NULL OR ("dek" ~ '[^[:space:]]' AND char_length("dek") <= 500)
  );

-- A tag or a source that is only whitespace is the same failure one level down:
-- the page renders a tag pill with nothing in it, or a citation nobody can
-- follow. Neither array can be walked by a CHECK, so the shape is zod's job —
-- what is expressible here is that a source, if present, looks like a URL at
-- all, and that is left to the application deliberately (see the note in the
-- blog_posts migration).

UPDATE "MovieTopic" SET "note" = NULL WHERE "note" !~ '[^[:space:]]';

ALTER TABLE "MovieTopic" DROP CONSTRAINT "MovieTopic_note_meaningful";
ALTER TABLE "MovieTopic"
  ADD CONSTRAINT "MovieTopic_note_meaningful" CHECK (
    "note" IS NULL OR ("note" ~ '[^[:space:]]' AND char_length("note") <= 500)
  );
