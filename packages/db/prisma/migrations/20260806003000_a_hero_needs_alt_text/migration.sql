-- A hero with no alt text is a hero we cannot ship.
--
-- The schema has said so since the blog was built, and nothing enforced it:
-- `Post_imageAlt_needs_image` only asserts the converse, so a picture could be
-- saved with no description and the page would render `alt=""` — which tells a
-- screen reader "this image is decorative, skip it". For a photograph of the
-- person the piece is about, that is not a small inaccuracy; it removes the
-- subject of the article from the page for the reader who needs it named.
--
-- Blank is not absent, so the test is for a non-space character rather than
-- `<> ''`: a caption of spaces is the same failure wearing a value. (The same
-- lesson as `Post_content_meaningful`, which passed a body of newlines until a
-- constraint test caught it.)
--
-- `IS NOT NULL` is stated separately and is not redundant. A CHECK passes when
-- its expression is NULL rather than false, and `NULL ~ '…'` is NULL — so the
-- regex alone caught a blank caption and waved through a missing one, which is
-- the case this constraint exists for. The constraint test found it.
ALTER TABLE "Post"
  ADD CONSTRAINT "Post_image_needs_alt"
  CHECK (
    "image" IS NULL
    OR ("imageAlt" IS NOT NULL AND "imageAlt" ~ '[^[:space:]]')
  );
