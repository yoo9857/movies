import { captureSocialHero, importSocialOriginal } from "@/lib/social-image-import";

const original = process.argv.includes("--original");
const positional = process.argv.slice(2).filter((value) => value !== "--original");
const url = positional[0];
const alt = positional.slice(1).join(" ") || "Social post capture";

if (!url) {
  console.error("usage: npm run capture-social -- <instagram|youtube|x-url> [alt text]");
  process.exit(1);
}

const run = original ? importSocialOriginal([url], alt) : captureSocialHero([url], alt);
run
  .then((result) => {
    if (!result) throw new Error("URL is not a supported Instagram, YouTube or X post");
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
