import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_POST_PICTURES,
  bodyPictureCount,
  minimumPictureMessage,
  postPictureCount,
} from "@/lib/post-visuals";

describe("post picture policy", () => {
  const body = [
    "![One](https://cdn.example.com/one.webp)",
    "![Two people](https://cdn.example.com/two.webp)",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://x.com/example/status/1234567890",
  ].join("\n\n");

  it("counts photographs but not social or video embeds", () => {
    expect(bodyPictureCount(body)).toBe(2);
    expect(postPictureCount(body, "https://cdn.example.com/hero.webp")).toBe(3);
    expect(postPictureCount(body, null)).toBe(2);
  });

  it("sets the editorial floor at one hero plus three body pictures", () => {
    expect(DEFAULT_MIN_POST_PICTURES).toBe(4);
    expect(minimumPictureMessage(1, DEFAULT_MIN_POST_PICTURES)).toContain(
      "one hero plus 3 in the body",
    );
  });
});
