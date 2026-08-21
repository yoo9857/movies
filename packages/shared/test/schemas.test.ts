import { describe, expect, it } from "vitest";
import {
  criticInputSchema,
  criticLinkSchema,
  movieSlug,
  paginationSchema,
  passwordSchema,
  profileInputSchema,
  ratingSchema,
  registerSchema,
  reviewInputSchema,
  slugSchema,
  usernameSchema,
} from "../src/index";

/** A minimal valid review, for tests that vary one field at a time. */
const review = {
  slug: "crossing-the-line",
  title: "Crossing the Line",
  content: "Bong draws class with architecture.",
  rating: 9,
  status: "DRAFT" as const,
  movieId: "cm000000000000000000000",
};

describe("slugSchema", () => {
  // Slugs land in URLs and in a filesystem-shaped route (/reviews/{slug}.md),
  // so the shape is a security boundary, not a style preference.
  it.each([
    ["../etc/passwd", "path traversal"],
    ["..", "bare traversal"],
    ["a/b", "path separator"],
    ["a\\b", "windows separator"],
    ["Uppercase", "uppercase"],
    ["-leading", "leading hyphen"],
    ["trailing-", "trailing hyphen"],
    ["double--hyphen", "consecutive hyphens"],
    ["", "empty"],
    ["a b", "space"],
    ["a.b", "dot"],
    ["a%2Fb", "encoded separator"],
    ["café", "non-ascii"],
    ["a_b", "underscore"],
  ])("rejects %j (%s)", (value) => {
    expect(slugSchema.safeParse(value).success).toBe(false);
  });

  it.each(["a", "a-b", "abc-123-def", "9"])("accepts %j", (value) => {
    expect(slugSchema.safeParse(value).success).toBe(true);
  });

  it("rejects anything over 120 characters", () => {
    expect(slugSchema.safeParse("a".repeat(120)).success).toBe(true);
    expect(slugSchema.safeParse("a".repeat(121)).success).toBe(false);
  });
});

describe("movieSlug", () => {
  it("builds title-year", () => {
    expect(movieSlug("Parasite", new Date("2019-05-30"))).toBe("parasite-2019");
    expect(movieSlug("2001: A Space Odyssey", "1968-04-02")).toBe("2001-a-space-odyssey-1968");
  });

  it("drops accents rather than dropping the letters", () => {
    expect(movieSlug("Amélie", new Date("2001-04-25"))).toBe("amelie-2001");
  });

  it("works without a release date", () => {
    expect(movieSlug("Dune Part Three")).toBe("dune-part-three");
  });

  it("falls back to 'film' for a title with no romanisable characters", () => {
    expect(movieSlug("기생충", new Date("2019-05-30"))).toBe("film-2019");
  });

  it("always satisfies the slug shape the database enforces", () => {
    for (const title of [
      "Parasite",
      "  spaced  out  ",
      "!!!",
      "Ça: c'est ★",
      // Real titles that begin or end with punctuation the strip leaves as a
      // hyphen. "-30-" (1959) is the one that took down a 500-film insert: it
      // slugged to "-30-1959", which the CHECK constraint refuses.
      "-30-",
      "—Ashes—",
      "...And Justice for All",
      "- - -",
    ]) {
      expect(movieSlug(title, new Date("2020-01-01"))).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("keeps the digits of a title that is only punctuation and a number", () => {
    expect(movieSlug("-30-", new Date("1959-01-01"))).toBe("30-1959");
  });
});

describe("usernameSchema", () => {
  it.each(["ab", "", "Upper", "has space", "dash-not-allowed", "a".repeat(31), "é_é"])(
    "rejects %j",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(["abc", "a_b_c", "user123", "a".repeat(30)])("accepts %j", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });
});

describe("passwordSchema", () => {
  // NIST 800-63B: length over composition rules. 12 is the floor.
  it("requires at least 12 characters", () => {
    expect(passwordSchema.safeParse("a".repeat(11)).success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(12)).success).toBe(true);
  });

  it("caps length at 128 so a huge body cannot become a scrypt DoS", () => {
    expect(passwordSchema.safeParse("a".repeat(128)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });
});

describe("ratingSchema", () => {
  it.each([0, 0.5, 5, 7.5, 10])("accepts %s", (value) => {
    expect(ratingSchema.safeParse(value).success).toBe(true);
  });

  it.each([-0.5, 10.5, 7.3, 0.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %s",
    (value) => {
      expect(ratingSchema.safeParse(value).success).toBe(false);
    },
  );

  it("mirrors the database CHECK constraints", () => {
    // Review_rating_range and Review_rating_step in the constraints migration
    // restate exactly this. If one side changes, this test should fail.
    expect(ratingSchema.safeParse(10).success).toBe(true);
    expect(ratingSchema.safeParse(11).success).toBe(false);
    expect(ratingSchema.safeParse(9.25).success).toBe(false);
  });
});

describe("criticLinkSchema url", () => {
  // z.url() accepts any parseable URL, javascript: included — the refine is
  // what actually blocks script schemes. These are the XSS cases.
  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "file:///etc/passwd",
    "not a url",
  ])("rejects %j", (url) => {
    expect(criticLinkSchema.safeParse({ label: "x", url }).success).toBe(false);
  });

  it.each(["https://a.com", "http://a.com/path?q=1"])("accepts %j", (url) => {
    expect(criticLinkSchema.safeParse({ label: "x", url }).success).toBe(true);
  });
});

describe("optional text normalisation", () => {
  // Regression: these used to parse to "" rather than undefined, because
  // `.optional().or(z.literal("").transform(...))` never reached its right
  // side. "" then defeated the `verdict ?? excerpt` fallback in the review
  // page's metadata, and put `image: ""` in a critic's JSON-LD.
  it("turns an empty excerpt and verdict into undefined, not an empty string", () => {
    const parsed = reviewInputSchema.parse({ ...review, excerpt: "", verdict: "" });
    expect(parsed.excerpt).toBeUndefined();
    expect(parsed.verdict).toBeUndefined();
  });

  it("normalises whitespace-only values the same way", () => {
    const parsed = reviewInputSchema.parse({ ...review, excerpt: "   ", verdict: "\t\n " });
    expect(parsed.excerpt).toBeUndefined();
    expect(parsed.verdict).toBeUndefined();
  });

  it("keeps real values, trimmed", () => {
    const parsed = reviewInputSchema.parse({ ...review, excerpt: "  a quiet drama  " });
    expect(parsed.excerpt).toBe("a quiet drama");
  });

  it("still enforces the maximum after trimming", () => {
    expect(reviewInputSchema.safeParse({ ...review, excerpt: "a".repeat(500) }).success).toBe(true);
    expect(reviewInputSchema.safeParse({ ...review, excerpt: "a".repeat(501) }).success).toBe(false);
  });

  it("applies to a critic's bio and avatarUrl", () => {
    const parsed = criticInputSchema.parse({
      slug: "roger-ebert",
      name: "Roger Ebert",
      bio: "",
      avatarUrl: "",
    });
    expect(parsed.bio).toBeUndefined();
    expect(parsed.avatarUrl).toBeUndefined();
  });

  it("does not let the empty-string path smuggle a bad avatar URL through", () => {
    expect(
      criticInputSchema.safeParse({
        slug: "x",
        name: "X",
        avatarUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});

describe("reviewInputSchema", () => {
  it("defaults spoilers to NONE", () => {
    expect(reviewInputSchema.parse(review).spoilers).toBe("NONE");
  });

  it("requires non-empty content and a known status", () => {
    expect(reviewInputSchema.safeParse({ ...review, content: "" }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...review, status: "ARCHIVED" }).success).toBe(false);
  });

  it("rejects a title that is only whitespace", () => {
    expect(reviewInputSchema.safeParse({ ...review, title: "   " }).success).toBe(false);
  });

  it("caps content so a single request cannot be unbounded", () => {
    expect(reviewInputSchema.safeParse({ ...review, content: "a".repeat(100_001) }).success).toBe(
      false,
    );
  });
});

describe("registerSchema", () => {
  it("rejects a malformed email", () => {
    const bad = { email: "not-an-email", username: "abc", password: "a".repeat(12) };
    expect(registerSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts a complete registration", () => {
    const ok = {
      email: "devoh@signpost.kr",
      username: "devoh",
      password: "a-long-enough-password",
      displayName: "Devoh",
    };
    expect(registerSchema.safeParse(ok).success).toBe(true);
  });
});

describe("profileInputSchema", () => {
  it("normalises cleared public fields to undefined", () => {
    expect(profileInputSchema.parse({ displayName: "  ", bio: "" })).toEqual({
      displayName: undefined,
      bio: undefined,
    });
  });

  it("caps a public biography", () => {
    expect(profileInputSchema.safeParse({ bio: "a".repeat(601) }).success).toBe(false);
    expect(profileInputSchema.safeParse({ bio: "Film critic and festival programmer." }).success).toBe(true);
  });
});

describe("paginationSchema", () => {
  it("defaults to page 1, pageSize 12", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 12 });
  });

  it("coerces query strings, which arrive as text", () => {
    expect(paginationSchema.parse({ page: "3", pageSize: "24" })).toEqual({
      page: 3,
      pageSize: 24,
    });
  });

  it("rejects an oversized pageSize rather than silently clamping it", () => {
    // A clamp would quietly serve 50 to a caller that asked for 999; a 400
    // tells them their request was wrong.
    expect(paginationSchema.safeParse({ pageSize: 999 }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: 1.5 }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: -1 }).success).toBe(false);
  });
});
