import { describe, expect, it } from "vitest";
import {
  commonsCaptureDay,
  instagramEmbedUrl,
  isInstagramUrl,
  pageLeadImage,
  xStatusId,
  youtubeThumbnailUrls,
  youtubeVideoId,
} from "@/lib/post-image-sources";

describe("youtubeVideoId", () => {
  it("reads every URL shape YouTube mints", () => {
    const id = "dQw4w9WgXcQ";
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=42s`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
    ]) {
      expect(youtubeVideoId(url), url).toBe(id);
    }
  });

  it("refuses what is not a video", () => {
    for (const url of [
      "https://www.youtube.com/@channel",
      "https://www.youtube.com/watch?v=tooshort",
      "https://vimeo.com/12345678",
      "https://example.com/watch?v=dQw4w9WgXcQ", // right query, wrong host
      "not a url",
    ]) {
      expect(youtubeVideoId(url), url).toBeNull();
    }
  });

  it("offers maxres first — the caller walks down when it 404s", () => {
    const urls = youtubeThumbnailUrls("dQw4w9WgXcQ");
    expect(urls[0]).toContain("maxresdefault");
    expect(urls.at(-1)).toContain("hqdefault");
    expect(urls.every((u) => u.startsWith("https://i.ytimg.com/vi/dQw4w9WgXcQ/"))).toBe(true);
  });
});

describe("xStatusId", () => {
  it("reads a status id from every host X has answered to", () => {
    for (const url of [
      "https://twitter.com/BTS_twt/status/1531343528732205056",
      "https://x.com/BTS_twt/status/1531343528732205056",
      "https://mobile.twitter.com/BTS_twt/status/1531343528732205056",
      "https://x.com/BTS_twt/status/1531343528732205056?s=20&t=abc",
    ]) {
      expect(xStatusId(url), url).toBe("1531343528732205056");
    }
  });

  it("refuses profiles, searches and lookalike hosts", () => {
    expect(xStatusId("https://x.com/BTS_twt")).toBeNull();
    expect(xStatusId("https://x.com/search?q=bts")).toBeNull();
    expect(xStatusId("https://notx.com/a/status/12345678")).toBeNull();
  });
});

describe("instagramEmbedUrl", () => {
  it("builds the official embed URL for posts, reels and tv", () => {
    expect(instagramEmbedUrl("https://www.instagram.com/p/CoAbCdEfGhI/")).toBe(
      "https://www.instagram.com/p/CoAbCdEfGhI/embed",
    );
    expect(instagramEmbedUrl("https://instagram.com/reel/CoAbCdEfGhI/?igsh=x")).toBe(
      "https://www.instagram.com/reel/CoAbCdEfGhI/embed",
    );
  });

  it("refuses profiles and other pages", () => {
    expect(instagramEmbedUrl("https://www.instagram.com/bts.bighitofficial/")).toBeNull();
    expect(instagramEmbedUrl("https://www.instagram.com/explore/")).toBeNull();
    expect(instagramEmbedUrl("https://example.com/p/CoAbCdEfGhI/")).toBeNull();
  });
});

describe("isInstagramUrl", () => {
  it("names instagram in all its shapes", () => {
    expect(isInstagramUrl("https://www.instagram.com/p/ABC123/")).toBe(true);
    expect(isInstagramUrl("https://instagram.com/someone")).toBe(true);
    expect(isInstagramUrl("https://about.instagram.com/x")).toBe(true);
    expect(isInstagramUrl("https://instagr.am/p/ABC123/")).toBe(true);
  });

  it("does not catch lookalikes", () => {
    expect(isInstagramUrl("https://notinstagram.com/p/1")).toBe(false);
    expect(isInstagramUrl("https://example.com/instagram.com")).toBe(false);
    expect(isInstagramUrl("plain text")).toBe(false);
  });
});

describe("commonsCaptureDay", () => {
  // DateTimeOriginal is free text in whatever template the uploader used;
  // these are the shapes seen in real extmetadata.
  it("reads ISO and EXIF-colon dates", () => {
    expect(commonsCaptureDay("2025-10-15")).toBe("2025-10-15");
    expect(commonsCaptureDay("2013:07:14 19:02:11")).toBe("2013-07-14");
  });

  it("reads dates wrapped in the uploader's HTML", () => {
    expect(
      commonsCaptureDay('<time class="dtstart" datetime="2025-10-15">15 October 2025</time>'),
    ).toBe("2025-10-15");
  });

  it("reads written-out dates in both orders", () => {
    expect(commonsCaptureDay("15 October 2025")).toBe("2025-10-15");
    expect(commonsCaptureDay("October 15, 2025")).toBe("2025-10-15");
  });

  it("falls back to a bare year, and to null for garbage", () => {
    expect(commonsCaptureDay("taken in 2019")).toBe("2019-01-01");
    expect(commonsCaptureDay("unknown")).toBeNull();
    expect(commonsCaptureDay(undefined)).toBeNull();
  });
});

describe("pageLeadImage", () => {
  const page = "https://news.example.com/articles/1";

  it("takes og:image whichever way the attributes are ordered", () => {
    expect(
      pageLeadImage(`<meta property="og:image" content="https://cdn.example.com/a.jpg">`, page),
    ).toBe("https://cdn.example.com/a.jpg");
    expect(
      pageLeadImage(`<meta content="https://cdn.example.com/b.jpg" property="og:image" />`, page),
    ).toBe("https://cdn.example.com/b.jpg");
  });

  it("prefers the secure variant, falls back to twitter's copy", () => {
    const html = `
      <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
      <meta property="og:image" content="https://cdn.example.com/og.jpg">
      <meta property="og:image:secure_url" content="https://cdn.example.com/secure.jpg">
    `;
    expect(pageLeadImage(html, page)).toBe("https://cdn.example.com/secure.jpg");
    expect(
      pageLeadImage(`<meta name="twitter:image" content="https://cdn.example.com/tw.jpg">`, page),
    ).toBe("https://cdn.example.com/tw.jpg");
  });

  it("resolves a relative value against the page and upgrades bare http", () => {
    expect(pageLeadImage(`<meta property="og:image" content="/img/lead.jpg">`, page)).toBe(
      "https://news.example.com/img/lead.jpg",
    );
    expect(
      pageLeadImage(`<meta property="og:image" content="http://cdn.example.com/a.jpg">`, page),
    ).toBe("https://cdn.example.com/a.jpg");
  });

  it("decodes the entities a CMS writes into content", () => {
    expect(
      pageLeadImage(
        `<meta property="og:image" content="https://cdn.example.com/a.jpg?w=1200&amp;h=630">`,
        page,
      ),
    ).toBe("https://cdn.example.com/a.jpg?w=1200&h=630");
  });

  it("answers null when the page nominates nothing", () => {
    expect(pageLeadImage(`<meta name="description" content="hello">`, page)).toBeNull();
    expect(pageLeadImage("", page)).toBeNull();
  });
});
