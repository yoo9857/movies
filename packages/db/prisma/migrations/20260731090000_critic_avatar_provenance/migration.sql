-- A critic's photograph, with the terms it arrived under.
--
-- The directory grew from one name to the canon, and the faces come from
-- Commons — which means licences, and licences mean credit. Same pattern as
-- Person and Movie artwork: the credit travels with the file, and a licence
-- without its source is refused. (The avatar itself does not require a
-- source, so an operator's own upload stays legal.)

ALTER TABLE "Critic" ADD COLUMN "avatarCredit" TEXT;
ALTER TABLE "Critic" ADD COLUMN "avatarLicense" TEXT;
ALTER TABLE "Critic" ADD COLUMN "avatarLicenseUrl" TEXT;
ALTER TABLE "Critic" ADD COLUMN "avatarSourceUrl" TEXT;

ALTER TABLE "Critic"
  ADD CONSTRAINT "Critic_avatar_license_has_source"
  CHECK ("avatarLicense" IS NULL OR "avatarSourceUrl" IS NOT NULL);
