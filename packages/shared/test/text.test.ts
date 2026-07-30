import { describe, expect, it } from "vitest";
import {
  countWords,
  extractHeadings,
  headingSlug,
  parseJsonArray,
  toStarScale,
} from "../src/index";

describe("readingMinutes / countWords", () => {
  it("never reports less than a minute", async () => {
    const { readingMinutes } = await import("../src/index");
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("one word")).toBe(1);
  });

  it("scales with length", async () => {
    const { readingMinutes } = await import("../src/index");
    const short = readingMinutes("word ".repeat(220));
    const long = readingMinutes("word ".repeat(2200));
    expect(short).toBe(1);
    expect(long).toBeGreaterThan(short);
  });

  it("counts CJK by character, since it has no spaces", () => {
    // 500 Korean characters is roughly a minute; as "words" it would be 1.
    expect(countWords("한".repeat(500))).toBe(500);
    expect(countWords("one two three")).toBe(3);
  });
});

describe("headingSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(headingSlug("The Long Goodbye")).toBe("the-long-goodbye");
  });

  it("drops punctuation that would break an anchor", () => {
    expect(headingSlug("Why *this*, though?")).toBe("why-this-though");
  });

  it("keeps Korean, which the site publishes in", () => {
    expect(headingSlug("기생충 다시 보기")).toBe("기생충-다시-보기");
  });

  it("caps length at 80", () => {
    expect(headingSlug("a".repeat(200))).toHaveLength(80);
  });
});

describe("extractHeadings", () => {
  it("finds ## and ### but not # or ####", () => {
    const md = ["# Title", "## Two", "### Three", "#### Four"].join("\n");
    expect(extractHeadings(md)).toEqual([
      { level: 2, text: "Two", id: "two" },
      { level: 3, text: "Three", id: "three" },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const md = ["## Real", "```", "## Not A Heading", "```", "## Also Real"].join("\n");
    expect(extractHeadings(md).map((h) => h.text)).toEqual(["Real", "Also Real"]);
  });

  it("disambiguates duplicate headings so anchors stay unique", () => {
    const md = ["## Notes", "## Notes", "## Notes"].join("\n");
    expect(extractHeadings(md).map((h) => h.id)).toEqual(["notes", "notes-2", "notes-3"]);
  });

  it("falls back to 'section' when a heading has no slug-able characters", () => {
    expect(extractHeadings("## ???").map((h) => h.id)).toEqual(["section"]);
  });

  it("strips inline emphasis from the heading text", () => {
    expect(extractHeadings("## A *bold* claim")[0].text).toBe("A bold claim");
  });
});

describe("toStarScale", () => {
  it("halves a 0-10 rating and rounds to two places", () => {
    expect(toStarScale(10)).toBe(5);
    expect(toStarScale(9.5)).toBe(4.75);
    expect(toStarScale(0)).toBe(0);
    expect(toStarScale(7)).toBe(3.5);
  });
});

describe("parseJsonArray", () => {
  it("returns [] for null, undefined and empty input", () => {
    expect(parseJsonArray(null)).toEqual([]);
    expect(parseJsonArray(undefined)).toEqual([]);
    expect(parseJsonArray("")).toEqual([]);
  });

  it("returns [] rather than throwing on malformed JSON", () => {
    expect(parseJsonArray("{not json")).toEqual([]);
  });

  it("returns [] for JSON that is valid but not an array", () => {
    expect(parseJsonArray('{"a":1}')).toEqual([]);
    expect(parseJsonArray('"a string"')).toEqual([]);
  });

  it("keeps only string members", () => {
    expect(parseJsonArray('["a",1,null,{"b":2},"c"]')).toEqual(["a", "c"]);
  });
});
