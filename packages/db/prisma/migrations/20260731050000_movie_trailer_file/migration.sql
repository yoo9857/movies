-- A trailer we host ourselves.
--
-- The billboard plays its film through a YouTube iframe, which means renting
-- someone else's player and then fighting its furniture — the centre controls
-- that surface whenever autoplay stalls or the tab scrolls away cannot be
-- removed, only masked. A file on our own storage plays through our own
-- <video> element: every pixel ours, nothing to mask. Same rule as every
-- other file column here: it is a path on our origin, never a hotlink.

ALTER TABLE "Movie" ADD COLUMN "trailerFile" TEXT;

ALTER TABLE "Movie"
  ADD CONSTRAINT "Movie_trailerFile_is_local"
  CHECK ("trailerFile" IS NULL OR "trailerFile" ~ '^/');
