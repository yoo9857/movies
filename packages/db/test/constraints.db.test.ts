import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createScratchDb, dropScratchDb, scratchUrl } from "./helpers/scratch-db";

/**
 * The invariants that live in PostgreSQL.
 *
 * `ops/postgres/README.md` states the reason these constraints exist: "a bug in
 * a route handler, a hand-written UPDATE during an incident, or a future
 * migration all go through these". That claim is only worth anything if the
 * constraints actually fire, which is what this file checks — by trying to write
 * the bad rows directly, bypassing zod entirely.
 */

const SUFFIX = "constraints";
let db: Client;

// Fixtures the Review rows can point at, so a failure is never just a FK error.
const USER = "user-fixture-0000000000";
const MOVIE = "movie-fixture-000000000";

const SQLSTATE = { check: "23514", unique: "23505", fk: "23503", notNull: "23502" } as const;

/** Insert a Review, letting the caller override any column. */
function insertReview(over: Record<string, unknown> = {}) {
  const row = {
    id: `r-${Math.random().toString(36).slice(2, 12)}`,
    slug: `slug-${Math.random().toString(36).slice(2, 10)}`,
    title: "A Title",
    content: "Body",
    rating: 8,
    status: "DRAFT",
    publishedAt: null,
    viewCount: 0,
    helpfulCount: 0,
    authorId: USER,
    movieId: MOVIE,
    ...over,
  };
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  return db.query(
    `INSERT INTO "Review" (${cols.map((c) => `"${c}"`).join(", ")}, "updatedAt")
     VALUES (${placeholders}, CURRENT_TIMESTAMP)`,
    Object.values(row) as never[],
  );
}

async function rejects(fn: () => Promise<unknown>, sqlstate: string): Promise<void> {
  await expect(fn()).rejects.toMatchObject({ code: sqlstate });
}

beforeAll(async () => {
  db = await createScratchDb(SUFFIX);
  await db.query(
    `INSERT INTO "User" ("id","email","username","passwordHash","role","updatedAt")
     VALUES ($1,'fixture@cinepixo.local','fixture','scrypt$1$1$1$x$y','MEMBER',CURRENT_TIMESTAMP)`,
    [USER],
  );
  await db.query(
    `INSERT INTO "Movie" ("id","slug","title","genres","updatedAt")
     VALUES ($1,'parasite-2019','Parasite',ARRAY['Drama'],CURRENT_TIMESTAMP)`,
    [MOVIE],
  );
});

afterAll(async () => {
  if (db) await dropScratchDb(db, SUFFIX);
});

describe("the scratch database is not the development database", () => {
  it("targets a _test_-suffixed name", () => {
    // Guard against this suite ever dropping real data.
    expect(scratchUrl(SUFFIX)!.name).toContain("_test_");
  });
});

describe("Review rating", () => {
  it.each([0, 0.5, 5, 9.5, 10])("accepts %s", async (rating) => {
    await expect(insertReview({ rating })).resolves.toBeTruthy();
  });

  it.each([-0.5, -1, 10.5, 11])("rejects out-of-range %s", async (rating) => {
    // Review_rating_range
    await rejects(() => insertReview({ rating }), SQLSTATE.check);
  });

  it.each([7.3, 9.25, 0.1])("rejects non-half-point %s", async (rating) => {
    // Review_rating_step — the multiplication trick avoids float surprises
    await rejects(() => insertReview({ rating }), SQLSTATE.check);
  });
});

describe("Review counters", () => {
  it.each(["viewCount", "helpfulCount"])("rejects a negative %s", async (column) => {
    await rejects(() => insertReview({ [column]: -1 }), SQLSTATE.check);
  });

  it("accepts zero", async () => {
    await expect(insertReview({ viewCount: 0, helpfulCount: 0 })).resolves.toBeTruthy();
  });
});

describe("Review status and publishedAt are paired", () => {
  // Review_published_has_date. The feeds sort on publishedAt, so a PUBLISHED row
  // without one would sort unpredictably and a DRAFT with one could leak a date.
  it("allows DRAFT with no date", async () => {
    await expect(insertReview({ status: "DRAFT", publishedAt: null })).resolves.toBeTruthy();
  });

  it("allows PUBLISHED with a date", async () => {
    await expect(
      insertReview({ status: "PUBLISHED", publishedAt: new Date("2026-01-01") }),
    ).resolves.toBeTruthy();
  });

  it("rejects PUBLISHED with no date", async () => {
    await rejects(
      () => insertReview({ status: "PUBLISHED", publishedAt: null }),
      SQLSTATE.check,
    );
  });

  it("rejects DRAFT carrying a date", async () => {
    await rejects(
      () => insertReview({ status: "DRAFT", publishedAt: new Date("2026-01-01") }),
      SQLSTATE.check,
    );
  });
});

describe("slug shape", () => {
  it.each(["Uppercase", "-leading", "trailing-", "double--hyphen", "has space", "../traversal", ""])(
    "Review rejects %j",
    async (slug) => {
      await rejects(() => insertReview({ slug }), SQLSTATE.check);
    },
  );

  it.each(["ok", "a-b-c", "9"])("Review accepts %j", async (slug) => {
    await expect(insertReview({ slug })).resolves.toBeTruthy();
  });

  it("Critic rejects a bad slug too", async () => {
    await rejects(
      () =>
        db.query(
          `INSERT INTO "Critic" ("id","slug","name","updatedAt")
           VALUES ('c1','Bad Slug','X',CURRENT_TIMESTAMP)`,
        ),
      SQLSTATE.check,
    );
  });
});

describe("Movie sanity constraints", () => {
  const movie = (over: Record<string, unknown>) => {
    const key = Math.random().toString(36).slice(2, 10);
    const row = { id: `m-${key}`, slug: `film-${key}`, title: "T", ...over };
    const cols = Object.keys(row);
    return db.query(
      `INSERT INTO "Movie" (${cols.map((c) => `"${c}"`).join(", ")}, "genres", "updatedAt")
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}, ARRAY[]::TEXT[], CURRENT_TIMESTAMP)`,
      Object.values(row) as never[],
    );
  };

  it.each([
    ["budget", -1],
    ["revenue", -1],
    ["runtime", -1],
    ["runtime", 1001],
    ["voteAverage", -0.1],
    ["voteAverage", 10.1],
  ])("rejects %s = %s", async (column, value) => {
    await rejects(() => movie({ [column]: value }), SQLSTATE.check);
  });

  it("allows NULL for unknown values, which is how the importer stores TMDB's 0", async () => {
    await expect(
      movie({ budget: null, revenue: null, runtime: null, voteAverage: null }),
    ).resolves.toBeTruthy();
  });

  it("allows the boundaries", async () => {
    await expect(movie({ runtime: 1000, voteAverage: 10, budget: 0 })).resolves.toBeTruthy();
  });

  it("rejects a malformed slug by shape", async () => {
    // Movie_slug_shape — same grammar as review slugs, because both end up in
    // URLs and in the .md rewrite pattern.
    await rejects(() => movie({ slug: "Upper-Case" }), SQLSTATE.check);
    await rejects(() => movie({ slug: "double--hyphen" }), SQLSTATE.check);
  });

  it("rejects a duplicate slug", async () => {
    await movie({ slug: "taken-2019" });
    await rejects(() => movie({ slug: "taken-2019" }), SQLSTATE.unique);
  });
});

describe("User identity", () => {
  const user = (email: string, username: string) =>
    db.query(
      `INSERT INTO "User" ("id","email","username","passwordHash","updatedAt")
       VALUES ($1,$2,$3,'scrypt$1$1$1$x$y',CURRENT_TIMESTAMP)`,
      [`u-${Math.random().toString(36).slice(2, 10)}`, email, username],
    );

  it("rejects a duplicate email differing only in case", async () => {
    // User_email_lower_key. Without it, Devoh@x.com and devoh@x.com are two
    // accounts that both believe they own the address — and the app compares
    // lowercased, so one of them can never log in.
    await user("Casing@cinepixo.local", "casing1");
    await rejects(() => user("casing@cinepixo.local", "casing2"), SQLSTATE.unique);
    await rejects(() => user("CASING@CINEPIXO.LOCAL", "casing3"), SQLSTATE.unique);
  });

  it("rejects an exactly duplicated username", async () => {
    await user("u1@cinepixo.local", "handle");
    await rejects(() => user("u2@cinepixo.local", "handle"), SQLSTATE.unique);
  });

  it("rejects an uppercase username by shape before uniqueness is consulted", async () => {
    // Worth being precise about: User_username_lower_key cannot be reached by a
    // case variation, because User_username_shape forbids uppercase outright, so
    // the answer is 23514 (check) and not 23505 (unique). The LOWER() index is
    // still real defence-in-depth — it would catch a future migration that
    // relaxed the shape — but it is not what stops "HANDLE" today.
    await user("u3@cinepixo.local", "lowercase");
    await rejects(() => user("u4@cinepixo.local", "LOWERCASE"), SQLSTATE.check);
  });

  it.each(["ab", "has space", "Upper", "dash-not-allowed", "a".repeat(31)])(
    "rejects username %j by shape",
    async (username) => {
      await rejects(() => user(`${Math.random()}@cinepixo.local`, username), SQLSTATE.check);
    },
  );

  it.each(["not-an-email", "no@domain", "a b@c.com", "@c.com", "a@"])(
    "rejects email %j by shape",
    async (email) => {
      await rejects(
        () => user(email, `ok${Math.random().toString(36).slice(2, 8)}`),
        SQLSTATE.check,
      );
    },
  );
});

describe("referential integrity", () => {
  it("refuses a review pointing at a missing author or movie", async () => {
    await rejects(() => insertReview({ authorId: "nobody" }), SQLSTATE.fk);
    await rejects(() => insertReview({ movieId: "nothing" }), SQLSTATE.fk);
  });
});

describe("trigram indexes exist for search", () => {
  it("indexes Movie.title and Review.title with GIN/trgm", async () => {
    // /search uses `contains`; without these every query is a sequential scan.
    const { rows } = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE indexname IN ('Movie_title_trgm','Review_title_trgm')`,
    );
    expect(rows.map((r) => r.indexname).sort()).toEqual(["Movie_title_trgm", "Review_title_trgm"]);
  });
});
