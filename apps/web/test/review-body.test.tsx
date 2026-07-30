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
