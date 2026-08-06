import { processImage } from "@/lib/media/image";
import { buildKey, putPublicObject } from "@/lib/media/storage";
import { instagramEmbedUrl, xStatusId, youtubeVideoId } from "@/lib/post-image-sources";

export type SocialPlatform = "Instagram" | "YouTube" | "X";

function platformFor(url: string): SocialPlatform | null {
  if (youtubeVideoId(url)) return "YouTube";
  if (xStatusId(url)) return "X";
  if (instagramEmbedUrl(url)) return "Instagram";
  return null;
}

/** Finds platform post URLs embedded in markdown, including bare embed lines. */
export function socialUrlsInText(text: string): string[] {
  return (text.match(/https?:\/\/[^\s<>()]+/g) ?? [])
    .map((url) => url.replace(/[.,;:!?]+$/, ""))
    .filter((url) => platformFor(url) !== null);
}

/**
 * Captures the rendered public post, rather than calling a platform API or
 * copying a platform-hosted media URL. Requires Playwright + a Chromium binary
 * on the publishing machine. Login walls and private posts are intentionally
 * rejected: this is a public-post capture tool.
 */
export async function captureSocialHero(urls: string[], alt: string) {
  const candidate = [...new Set(urls)].find(platformFor);
  if (!candidate) return null;

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("Social capture needs Playwright. Run npm install and npx playwright install chromium.");
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SOCIAL_CAPTURE_BROWSER_PATH || undefined,
  });
  try {
    const platform = platformFor(candidate)!;
    const status = platform === "X" ? xStatusId(candidate) : null;
    const captureUrl = platform === "X" && status
      ? `https://platform.twitter.com/embed/Tweet.html?id=${status}`
      : platform === "Instagram"
        ? instagramEmbedUrl(candidate) ?? candidate
        : candidate;
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(captureUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(Number(process.env.SOCIAL_CAPTURE_WAIT_MS ?? 5000));

    const blocked = await page.locator("text=/log in|sign in|this page isn't available|페이지를 사용할 수 없습니다/i").count();
    if (blocked > 0) throw new Error("The social post requires login or is unavailable; public capture only.");

    // Keep only the attached media. The post chrome, author, comments and
    // platform play button are not part of the image we publish.
    let target;
    if (platform === "YouTube") {
      await page.addStyleTag({
        content: ".ytp-chrome-bottom,.ytp-gradient-bottom,.ytp-large-play-button,.ytp-title,.ytp-watermark{display:none!important}",
      });
      const video = page.locator("video").first();
      await video.evaluate((node) => {
        const media = node as HTMLVideoElement;
        media.muted = true;
        void media.play().catch(() => undefined);
      }).catch(() => undefined);
      await page.waitForTimeout(1500);
      target = page.locator("#player, ytd-player").first();
    } else if (platform === "X") {
      const index = await page.locator('article img[src*="twimg.com"], article video').evaluateAll((media) => {
        let best = -1;
        let area = 0;
        media.forEach((node, i) => {
          const rect = node.getBoundingClientRect();
          const next = rect.width * rect.height;
          if (rect.width > 200 && rect.height > 200 && next > area) {
            best = i;
            area = next;
          }
        });
        return best;
      });
      if (index >= 0) target = page.locator('article img[src*="twimg.com"], article video').nth(index);
    } else {
      const video = page.locator("article video, video").first();
      if ((await video.count()) > 0 && await video.isVisible().catch(() => false)) {
        await video.evaluate((node) => {
          const media = node as HTMLVideoElement;
          media.muted = true;
          void media.play().catch(() => undefined);
        }).catch(() => undefined);
        await page.waitForTimeout(1000);
        target = video;
      } else {
        const index = await page.locator("img").evaluateAll((images) => {
          let best = -1;
          let area = 0;
          images.forEach((image, i) => {
            const rect = image.getBoundingClientRect();
            const next = rect.width * rect.height;
            if (rect.width > 200 && rect.height > 200 && next > area) {
              best = i;
              area = next;
            }
          });
          return best;
        });
        if (index >= 0) target = page.locator("img").nth(index);
      }
    }
    if (!target) throw new Error("No attached image or video was found in this post.");
    await target.waitFor({ state: "visible", timeout: 15000 });
    const png = await target.screenshot({ type: "png" });
    const image = await processImage(Buffer.from(png), { fullWidth: 1600 });
    const imageUrl = await putPublicObject(buildKey("posts", image.ext), image.full.data, image.contentType);
    return {
      image: imageUrl,
      imageAlt: alt.slice(0, 300),
      imageCredit: `${platform} public post capture`,
      imageLicense: undefined,
      imageLicenseUrl: undefined,
      imageSourceUrl: candidate,
    };
  } finally {
    await browser.close();
  }
}
