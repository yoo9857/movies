import { captureSocialHero } from "@/lib/social-image-import";

const url = process.argv[2];
const alt = process.argv.slice(3).join(" ") || "Social post capture";

if (!url) {
  console.error("usage: npm run capture-social -- <instagram|youtube|x-url> [alt text]");
  process.exit(1);
}

captureSocialHero([url], alt)
  .then((result) => {
    if (!result) throw new Error("URL is not a supported Instagram, YouTube or X post");
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
