-- Category answers "what is this about?"; format answers "what does it do for
-- the reader?". Existing posts receive the neutral editorial-feature label
-- until an editor makes a more specific, visible claim about their method.
CREATE TYPE "PostFormat" AS ENUM (
  'EDITORIAL_FEATURE',
  'REPORTED_ANALYSIS',
  'PROBLEM_SOLVING',
  'COMPARISON',
  'ROUNDUP',
  'CHECKLIST',
  'FIRST_HAND_GUIDE'
);

ALTER TABLE "Post"
  ADD COLUMN "format" "PostFormat" NOT NULL DEFAULT 'EDITORIAL_FEATURE',
  ADD COLUMN "methodNote" TEXT,
  ADD COLUMN "disclosure" TEXT,
  ADD COLUMN "correctionNote" TEXT;

-- "First hand" is a claim about evidence, not a decorative label. A live page
-- cannot make it without telling the reader what was actually done.
ALTER TABLE "Post" ADD CONSTRAINT "Post_first_hand_has_evidence"
  CHECK (
    "status" <> 'PUBLISHED'
    OR "format" <> 'FIRST_HAND_GUIDE'
    OR (
      length(btrim(COALESCE("methodNote", ''))) >= 20
      AND length(btrim(COALESCE("disclosure", ''))) >= 1
    )
  );

-- Utility formats need receipts of some kind: external sources, or a visible
-- method note describing the desk's own test/comparison. This deliberately
-- leaves reported analysis under the existing category-based source rule.
ALTER TABLE "Post" ADD CONSTRAINT "Post_utility_has_evidence"
  CHECK (
    "status" <> 'PUBLISHED'
    OR "format" NOT IN ('PROBLEM_SOLVING', 'COMPARISON', 'ROUNDUP', 'CHECKLIST')
    OR cardinality("sources") > 0
    OR length(btrim(COALESCE("methodNote", ''))) >= 20
  );
