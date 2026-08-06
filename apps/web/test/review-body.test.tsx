import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewBody, type ReviewMedia } from "@/components/review/ReviewBody";

const media: ReviewMedia = {
  title: "Parasite",
  trailerKey: "abc123xyz00",
  stills: ["/still-one.jpg", "/still-two.jpg"],
};

const render = (content: string, m: ReviewMedia = media) =>
  renderToStaticMarkup(<ReviewBody content={content} media={m} />);

describe("emphasis around CJK text", () => {
  // CommonMark's flanking rules assume spaces between words. Korean attaches
  // particles directly (`**기생충!**은`), which used to leave the asterisks in
  // the rendered page as literal text. remark-cjk-friendly fixes the rules;
  // these pin it in place.
  it("bolds text ending in punctuation followed by a particle", () => {
    const html = render("**기생충!**은 걸작이다");
    expect(html).toContain("<strong>기생충!</strong>은");
    expect(html).not.toContain("**");
  });

  it("bolds a quoted phrase attached to Hangul", () => {
    const html = render('**"명작"**이라 불린다');
    expect(html).toContain("</strong>이라");
  });

  it("italicises through the same boundary", () => {
    const html = render("*아이러니!*라는 말");
    expect(html).toContain("<em>아이러니!</em>라는");
  });

  it("strikes through the same boundary", () => {
    const html = render("~~걸작?~~은 아니다");
    expect(html).toContain("<del>걸작?</del>은");
  });

  it("keeps plain-space emphasis working exactly as before", () => {
    expect(render("this is **bold** here")).toContain("this is <strong>bold</strong> here");
    expect(render("**기생충**은 걸작이다")).toContain("<strong>기생충</strong>은");
  });
});

describe("uploaded images", () => {
  it("renders ![alt](url) as a framed, lazy image", () => {
    const html = render("![the staircase shot](/uploads/reviews/2026/07/abc.webp)");
    expect(html).toContain('src="/uploads/reviews/2026/07/abc.webp"');
    expect(html).toContain('alt="the staircase shot"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("rounded-xl");
  });

  it("renders an image with empty alt rather than dropping it", () => {
    expect(render("![](/uploads/reviews/2026/07/abc.webp)")).toContain('alt=""');
  });

  // Two pictures in one paragraph are a row; one is still full width. This is
  // what lets a piece run 1 / 2 / 2 / 1 down the page.
  it("sets two images in one paragraph side by side", () => {
    const html = render("![one](/uploads/posts/a.webp)\n![two](/uploads/posts/b.webp)");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain('alt="one"');
    expect(html).toContain('alt="two"');
  });

  it("leaves a lone image full width, not in a grid", () => {
    expect(render("![only](/uploads/posts/a.webp)")).not.toContain("sm:grid-cols-2");
  });

  it("does not treat a paragraph of words and one image as a row", () => {
    const html = render("Look at ![this](/uploads/posts/a.webp) here");
    expect(html).not.toContain("sm:grid-cols-2");
  });
});

describe("photo credits", () => {
  // A licence line has to be on the page and must not read as prose. The
  // house convention is one emphasis run opening "Photo:" / "Photos:".
  it("sets a credit line at caption scale", () => {
    const html = render("*Photo: PhilipRomano · [CC BY-SA 4.0](https://x.test) · [source](https://y.test)*");
    expect(html).toContain('class="cx-credit"');
    // The obligation itself survives the restyling.
    expect(html).toContain("PhilipRomano");
    expect(html).toContain("https://x.test");
  });

  it("recognises the plural form a two-up row writes", () => {
    expect(render("*Photos: PhilipRomano · CC BY-SA 4.0*")).toContain('class="cx-credit"');
  });

  it("leaves an author's own italic paragraph alone", () => {
    const html = render("*This is a line of emphasis the writer meant.*");
    expect(html).not.toContain("cx-credit");
  });

  it("does not catch a sentence that merely mentions a photo", () => {
    expect(render("The *Photo: caption* sits mid-sentence here")).not.toContain("cx-credit");
  });
});

describe("pasted video URLs", () => {
  // The embed syntax is "a paragraph that is nothing but the URL". Anything
  // an author wrapped in words stays a link — their words stand.
  const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  // The frame's one reliable fingerprint: next/image may rewrite the
  // thumbnail src through the optimizer, but the play button's label is ours.
  const PLAY = 'aria-label="Play YouTube video"';

  it("turns a bare YouTube URL paragraph into the click-to-load frame", () => {
    const html = render(`before\n\n${url}\n\nafter`);
    expect(html).toContain(PLAY);
    expect(html).toContain("dQw4w9WgXcQ"); // the key reaches the thumbnail URL
    expect(html).not.toContain(`<p>${url}</p>`);
  });

  it("embeds the [url](url) form the editor round-trip may produce", () => {
    expect(render(`[${url}](${url})`)).toContain(PLAY);
  });

  it("leaves a written link and an in-sentence URL as links", () => {
    const written = render(`[the Dynamite video](${url})`);
    expect(written).toContain(">the Dynamite video</a>");
    expect(written).not.toContain(PLAY);

    const inline = render(`Watch it at ${url} tonight.`);
    expect(inline).toContain(`href="${url}"`);
    expect(inline).not.toContain(PLAY);
  });

  it("does not embed hosts that only look like YouTube", () => {
    expect(render("https://example.com/watch?v=dQw4w9WgXcQ")).not.toContain(PLAY);
  });

  it("turns a bare X status URL into the platform's click-to-load frame", () => {
    const html = render("https://x.com/BTS_twt/status/1531343528732205056");
    expect(html).toContain('aria-label="Load this X post"');
    // A profile URL is not a post; it stays a link.
    expect(render("https://x.com/BTS_twt")).not.toContain("Load this X post");
  });

  it("turns a bare Instagram post URL into the click-to-load frame", () => {
    const html = render("https://www.instagram.com/p/CoAbCdEfGhI/");
    expect(html).toContain('aria-label="Load this Instagram post"');
    expect(render("https://www.instagram.com/bts.bighitofficial/")).not.toContain(
      "Load this Instagram post",
    );
  });
});

describe("authoring primitives", () => {
  it("renders ==text== as a mark", () => {
    expect(render("a ==highlighted== phrase")).toContain("<mark");
  });

  it("renders :::still N with the film's nth still", () => {
    // Stills go through next/image, so the TMDB URL appears percent-encoded
    // inside the optimizer's src.
    const html = render(":::still 2");
    expect(html).toContain("still-two.jpg");
    expect(html).not.toContain("still-one.jpg");
  });

  it("drops a still the film does not have instead of a broken frame", () => {
    expect(render(":::still 9")).not.toContain("img");
  });

  it("renders the trailer only when the film has one", () => {
    expect(render(":::trailer")).toContain("abc123xyz00");
    expect(render(":::trailer", { ...media, trailerKey: null })).not.toContain("iframe");
  });

  it("covers an unterminated spoiler rather than leaking it", () => {
    const html = render(":::spoiler\nthe basement reveal");
    expect(html).toContain("the basement reveal");
    // The Spoiler wrapper is present (a button to reveal).
    expect(html).toContain("<button");
  });
});

describe("what must not render", () => {
  it("never renders raw HTML from the markdown source", () => {
    // react-markdown leaves raw HTML as escaped text: visible, inert.
    const html = render('<script>alert(1)</script> and <img src=x onerror=alert(1)>');
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<img[^>]*onerror/);
  });
});
