import { fetchRemoteImage, processImage } from "@/lib/media/image";
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

export type SocialProfiles = Partial<Record<SocialPlatform, string>>;

function normalizedSubject(subject: string): string {
  return subject.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function embeddedPostUrls(html: string, platform: SocialPlatform): string[] {
  if (platform === "Instagram") {
    return [...html.matchAll(/(?:https?:\/\/www\.instagram\.com)?\/(?:p|reel|tv)\/([A-Za-z0-9_-]{5,80})/g)]
      .map((match) => `https://www.instagram.com/${match[0].includes("/reel/") ? "reel" : match[0].includes("/tv/") ? "tv" : "p"}/${match[1]}/`);
  }
  return [];
}

/** Discover the first visible post/video link in a supplied public profile. */
export async function discoverLatestSocialUrl(profileUrl: string, platform: SocialPlatform): Promise<string | null> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("Latest social discovery needs Playwright and Chromium.");
  }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SOCIAL_CAPTURE_BROWSER_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(Number(process.env.SOCIAL_CAPTURE_WAIT_MS ?? 5000));
    const hrefs = await page.locator("a[href]").evaluateAll((anchors) =>
      anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
    );
    const match = hrefs.find((href) => {
      try {
        new URL(href);
        if (platform === "YouTube") return youtubeVideoId(href) !== null;
        if (platform === "X") return xStatusId(href) !== null;
        return instagramEmbedUrl(href) !== null;
      } catch {
        return false;
      }
    });
    if (match) return match;

    // Some logged-out profile pages render post links in bootstrap JSON rather
    // than as anchors. Read those links without calling a platform API.
    const html = await page.content();
    return embeddedPostUrls(html, platform)[0] ?? null;
  } finally {
    await browser.close();
  }
}

/** Discover then capture the newest available public social post. */
export async function captureLatestSocialHero(profiles: SocialProfiles, alt: string, subject?: string) {
  for (const platform of ["Instagram", "YouTube", "X"] as const) {
    const profile = profiles[platform];
    if (!profile) continue;
    let latest: string | null = null;
    try {
      latest = await discoverLatestSocialUrl(profile, platform);
    } catch {
      // A login wall, deleted profile, or transient platform response should
      // not prevent trying the next configured source.
      continue;
    }
    if (!latest) continue;
    let captured;
    try {
      captured = await captureSocialHero([latest], alt, subject);
    } catch {
      continue;
    }
    if (captured) return { ...captured, discoveredPlatform: platform, discoveredPostUrl: latest };
  }
  return null;
}

/**
 * Captures the rendered public post, rather than calling a platform API or
 * copying a platform-hosted media URL. Requires Playwright + a Chromium binary
 * on the publishing machine. Login walls and private posts are intentionally
 * rejected: this is a public-post capture tool.
 */
export async function captureSocialHero(urls: string[], alt: string, subject?: string) {
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

    if (subject) {
      const wanted = normalizedSubject(subject);
      const visibleText = (await page.locator("body").innerText()).toLocaleLowerCase();
      // A profile handle is not evidence that the attached media is about the
      // subject. Logged-out Instagram embeds often hide captions, so reject
      // that case instead of publishing an unrelated behind-the-scenes frame.
      if (!visibleText.includes(wanted)) {
        throw new Error(`Social post is not textually related to subject: ${subject}`);
      }
    }

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
    await target.scrollIntoViewIfNeeded();
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

/**
 * Imports the largest public media URL exposed by the rendered post. This is
 * deliberately separate from captureSocialHero: it preserves source pixels
 * instead of rasterising the browser viewport into a screenshot.
 */
export async function importSocialOriginal(urls: string[], alt: string, subject?: string) {
  const candidate = [...new Set(urls)].find(platformFor);
  if (!candidate) return null;
  const platform = platformFor(candidate)!;
  if (platform === "YouTube") {
    const id = youtubeVideoId(candidate);
    if (!id) return null;
    const source = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
    const image = await processImage(await fetchRemoteImage(source), { fullWidth: 2400 });
    const imageUrl = await putPublicObject(buildKey("posts", image.ext), image.full.data, image.contentType);
    return { image: imageUrl, imageAlt: alt.slice(0, 300), imageCredit: "YouTube public thumbnail", imageSourceUrl: candidate };
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SOCIAL_CAPTURE_BROWSER_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
    const captureUrl = platform === "X" ? `https://platform.twitter.com/embed/Tweet.html?id=${xStatusId(candidate)}` : instagramEmbedUrl(candidate) ?? candidate;
    await page.goto(captureUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(Number(process.env.SOCIAL_CAPTURE_WAIT_MS ?? 5000));
    if (subject) {
      const body = (await page.locator("body").innerText()).toLocaleLowerCase();
      if (!body.includes(normalizedSubject(subject))) throw new Error(`Social post is not textually related to subject: ${subject}`);
    }
    const media = await page.locator(platform === "X" ? 'article img[src*="twimg.com"]' : "img").evaluateAll((images) => images.map((node) => {
      const image = node as HTMLImageElement;
      const rect = image.getBoundingClientRect();
      const candidates = (image.srcset || "").split(",").map((part) => {
        const bits = part.trim().split(/\s+/);
        return { url: bits[0], width: Number.parseInt(bits[1] || "0", 10) };
      }).filter((item) => item.url);
      candidates.sort((a, b) => b.width - a.width);
      return { url: candidates[0]?.url || image.currentSrc || image.src, area: rect.width * rect.height };
    }).filter((item) => item.area > 40000));
    const source = media.sort((a, b) => b.area - a.area)[0]?.url;
    if (!source) throw new Error("No public original media URL was exposed by this post.");
    const normalized = platform === "X" ? source.replace(/([?&])name=[^&]+/, "$1name=orig") : source;
    const image = await processImage(await fetchRemoteImage(normalized), { fullWidth: 2400 });
    const imageUrl = await putPublicObject(buildKey("posts", image.ext), image.full.data, image.contentType);
    return { image: imageUrl, imageAlt: alt.slice(0, 300), imageCredit: `${platform} public media import`, imageSourceUrl: candidate };
  } finally {
    await browser.close();
  }
}
