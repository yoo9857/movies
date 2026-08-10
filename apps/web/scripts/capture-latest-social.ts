import { captureLatestSocialHero, type SocialProfiles } from "@/lib/social-image-import";

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

const profiles: SocialProfiles = {
  Instagram: arg("instagram"),
  YouTube: arg("youtube"),
  X: arg("x"),
};
const alt = process.argv.find((value) => value.startsWith("--alt="))?.slice("--alt=".length) ?? "Latest social post media";
const subject = arg("subject");

if (!profiles.Instagram && !profiles.YouTube && !profiles.X) {
  console.error("usage: npm run capture-latest-social -w web -- --instagram=<profile-url> --youtube=<channel-url> --x=<profile-url> --subject=<article-subject> --alt=<text>");
  process.exit(1);
}

captureLatestSocialHero(profiles, alt, subject)
  .then((result) => {
    if (!result) throw new Error("No public latest post with attached media was found.");
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
