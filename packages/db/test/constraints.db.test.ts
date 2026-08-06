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

const SQLSTATE = {
  check: "23514",
  unique: "23505",
  fk: "23503",
  notNull: "23502",
  /** invalid_text_representation — what a real enum answers to a bad label. */
  badEnum: "22P02",
} as const;

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

  /**
   * Video columns: the file is ours, and its terms travel with it.
   *
   * `trailerFile` and `filmFile` both hold a video we host — a public-domain
   * trailer or the whole picture, imported from Commons. Three rules are in the
   * database rather than in the importer, because an incident-time UPDATE goes
   * through the database and not through the importer.
   */
  const OURS = "https://pokemon-dive.us-lax-4.linodeobjects.com/cinepixo/x.webm";

  /**
   * The poster answers to the same rule as the videos.
   *
   * It did not always: `image` took `^/` alone, because when it was added "ours"
   * and "on this filesystem" were the same sentence. Moving uploads to the
   * bucket broke that equivalence, not the reason behind it — a hotlinked poster
   * is still the thing this refuses.
   */
  it("image must be our origin or our bucket", async () => {
    await expect(
      movie({ image: "/uploads/films/2026/08/a.webp", imageSourceUrl: "https://commons.wikimedia.org/wiki/File:A" }),
    ).resolves.toBeTruthy();
    await expect(
      movie({
        image: "https://pokemon-dive.us-lax-4.linodeobjects.com/cinepixo/films/2026/08/a.webp",
        imageSourceUrl: "https://commons.wikimedia.org/wiki/File:A",
      }),
    ).resolves.toBeTruthy();
    await rejects(
      () =>
        movie({
          image: "https://upload.wikimedia.org/wikipedia/commons/a/a6/a.webp",
          imageSourceUrl: "https://commons.wikimedia.org/wiki/File:A",
        }),
      SQLSTATE.check,
    );
    // Another bucket is not our bucket, however plausible the host looks.
    await rejects(
      () =>
        movie({
          image: "https://pokemon-dive.us-lax-4.linodeobjects.com/someone-else/a.webp",
          imageSourceUrl: "https://commons.wikimedia.org/wiki/File:A",
        }),
      SQLSTATE.check,
    );
  });

  it.each([["trailerFile"], ["filmFile"]])("%s must be our origin or our bucket", async (col) => {
    await expect(movie({ [col]: "/uploads/trailers/2026/07/a.webm" })).resolves.toBeTruthy();
    await expect(movie({ [col]: OURS })).resolves.toBeTruthy();
    // A hotlink is the case this exists to refuse: a URL we do not control is a
    // page that breaks when someone else renames a file.
    await rejects(
      () => movie({ [col]: "https://upload.wikimedia.org/wikipedia/commons/a/a6/x.webm" }),
      SQLSTATE.check,
    );
  });

  it.each([
    ["trailerFileLicense", "trailerFileSourceUrl", "trailerFile"],
    ["filmFileLicense", "filmFileSourceUrl", "filmFile"],
  ])("%s without %s is refused", async (license, source, file) => {
    await rejects(() => movie({ [file]: "/uploads/x.webm", [license]: "Public domain" }), SQLSTATE.check);
    await expect(
      movie({
        [file]: "/uploads/x.webm",
        [license]: "Public domain",
        [source]: "https://commons.wikimedia.org/wiki/File:X.webm",
      }),
    ).resolves.toBeTruthy();
  });

  it.each([
    ["trailerFileDuration", "trailerFile"],
    ["filmFileDuration", "filmFile"],
  ])("%s without a file is a number about nothing", async (duration, file) => {
    await rejects(() => movie({ [duration]: 140 }), SQLSTATE.check);
    await expect(movie({ [file]: "/uploads/x.webm", [duration]: 140 })).resolves.toBeTruthy();
  });

  it("lets an operator upload state no licence, so the billboard's own file stays legal", async () => {
    await expect(movie({ trailerFile: "/uploads/trailers/own.mp4" })).resolves.toBeTruthy();
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

describe("Topic identity", () => {
  const key = () => Math.random().toString(36).slice(2, 10);

  /** Insert a Topic, letting the caller override any column. */
  const topic = (over: Record<string, unknown> = {}) => {
    const k = key();
    const row = { id: `t-${k}`, slug: `axis-${k}`, name: `Axis ${k}`, kind: "THEME", ...over };
    const cols = Object.keys(row);
    return db.query(
      `INSERT INTO "Topic" (${cols.map((c) => `"${c}"`).join(", ")}, "updatedAt")
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}, CURRENT_TIMESTAMP)`,
      Object.values(row) as never[],
    );
  };

  it.each(["Upper-Case", "-leading", "trailing-", "double--hyphen", "has space", ""])(
    "rejects slug %j by shape",
    async (slug) => {
      // Topic_slug_shape — a topic slug is a public URL like every other one.
      await rejects(() => topic({ slug }), SQLSTATE.check);
    },
  );

  it("rejects a duplicate slug", async () => {
    await topic({ slug: "class-divide" });
    await rejects(() => topic({ slug: "class-divide" }), SQLSTATE.unique);
  });

  it("rejects a name differing only in case", async () => {
    // Topic_name_lower_key. The admin screen looks for a clash
    // case-insensitively, so "Class Divide" and "class divide" must not be able
    // to become two rows behind its back — they are one editorial idea twice.
    await topic({ name: "Stairs and Levels" });
    await rejects(() => topic({ name: "stairs and levels" }), SQLSTATE.unique);
    await rejects(() => topic({ name: "STAIRS AND LEVELS" }), SQLSTATE.unique);
  });

  it("accepts both kinds and refuses a third", async () => {
    await expect(topic({ kind: "THEME" })).resolves.toBeTruthy();
    await expect(topic({ kind: "MOTIF" })).resolves.toBeTruthy();
    // TopicKind is a real PostgreSQL enum here, unlike the string columns the
    // SQLite era left behind — so an invented kind never reaches a page.
    await rejects(() => topic({ kind: "GENRE" }), SQLSTATE.badEnum);
  });

  it("indexes Topic.name with GIN/trgm, like every other searchable name", async () => {
    const { rows } = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE indexname = 'Topic_name_trgm'`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("MovieTopic assignments", () => {
  const key = () => Math.random().toString(36).slice(2, 10);

  /** A topic to hang assignments on, returned as its id. */
  async function newTopic(): Promise<string> {
    const id = `t-${key()}`;
    await db.query(
      `INSERT INTO "Topic" ("id","slug","name","kind","updatedAt")
       VALUES ($1,$2,$3,'MOTIF',CURRENT_TIMESTAMP)`,
      [id, `axis-${key()}`, `Axis ${key()}`],
    );
    return id;
  }

  async function newMovie(): Promise<string> {
    const id = `m-${key()}`;
    await db.query(
      `INSERT INTO "Movie" ("id","slug","title","genres","updatedAt")
       VALUES ($1,$2,'T',ARRAY[]::TEXT[],CURRENT_TIMESTAMP)`,
      [id, `film-${key()}`],
    );
    return id;
  }

  const assign = (topicId: string, movieId: string, note: unknown) =>
    db.query(`INSERT INTO "MovieTopic" ("movieId","topicId","note") VALUES ($1,$2,$3)`, [
      movieId,
      topicId,
      note,
    ] as never[]);

  it("accepts a note, and NULL for an assignment not yet argued", async () => {
    const [t, m1, m2] = await Promise.all([newTopic(), newMovie(), newMovie()]);
    await expect(assign(t, m1, "One downpour, two addresses.")).resolves.toBeTruthy();
    await expect(assign(t, m2, null)).resolves.toBeTruthy();
  });

  it.each(["", "   "])("rejects note %j, which is not a note", async (note) => {
    // MovieTopic_note_meaningful. An empty string would render as a film listed
    // with a dash after it — the page claiming an argument it does not have.
    //
    // Only spaces, deliberately: one-argument btrim() strips spaces and nothing
    // else, so a tab-only note would pass this CHECK. zod's .trim() is what
    // catches that on the way in, and every write goes through it.
    const [t, m] = await Promise.all([newTopic(), newMovie()]);
    await rejects(() => assign(t, m, note), SQLSTATE.check);
  });

  it("accepts a note at 500 characters and rejects 501", async () => {
    const [t, m1, m2] = await Promise.all([newTopic(), newMovie(), newMovie()]);
    await expect(assign(t, m1, "x".repeat(500))).resolves.toBeTruthy();
    await rejects(() => assign(t, m2, "y".repeat(501)), SQLSTATE.check);
  });

  it("refuses the same film twice on one topic", async () => {
    // The composite primary key is what makes the film list a set, so the
    // wholesale PUT cannot produce a page listing a film twice.
    const [t, m] = await Promise.all([newTopic(), newMovie()]);
    await assign(t, m, "First reading.");
    await rejects(() => assign(t, m, "Second reading."), SQLSTATE.unique);
  });

  it("refuses an assignment pointing at a missing film or topic", async () => {
    const [t, m] = await Promise.all([newTopic(), newMovie()]);
    await rejects(() => assign(t, "no-such-movie", null), SQLSTATE.fk);
    await rejects(() => assign("no-such-topic", m, null), SQLSTATE.fk);
  });

  const countFor = async (column: '"topicId"' | '"movieId"', id: string) => {
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM "MovieTopic" WHERE ${column} = $1`,
      [id],
    );
    return Number(rows[0].n);
  };

  it("deletes assignments with the topic, and leaves the film alone", async () => {
    const [t, m] = await Promise.all([newTopic(), newMovie()]);
    await assign(t, m, "The reading.");
    await db.query(`DELETE FROM "Topic" WHERE "id" = $1`, [t]);
    expect(await countFor('"topicId"', t)).toBe(0);
    const { rows } = await db.query(`SELECT 1 FROM "Movie" WHERE "id" = $1`, [m]);
    expect(rows).toHaveLength(1);
  });

  it("deletes assignments with the film, so a topic page cannot cite a ghost", async () => {
    const [t, m] = await Promise.all([newTopic(), newMovie()]);
    await assign(t, m, "The reading.");
    await db.query(`DELETE FROM "Movie" WHERE "id" = $1`, [m]);
    expect(await countFor('"movieId"', m)).toBe(0);
    const { rows } = await db.query(`SELECT 1 FROM "Topic" WHERE "id" = $1`, [t]);
    expect(rows).toHaveLength(1);
  });
});

/**
 * The blog's invariants.
 *
 * One of these is unlike anything else in this file. Every other constraint here
 * protects data shape — a rating in range, a slug that parses, a counter that
 * cannot go negative. `Post_claims_are_sourced` protects a *person*: a post filed
 * under PEOPLE or ISSUE is a factual claim about someone who can be harmed by our
 * getting it wrong and can sue us for it, and the database refuses to let one
 * reach PUBLISHED with nothing to cite. Which means it is the constraint most
 * worth proving actually fires.
 */
describe("Post", () => {
  const key = () => Math.random().toString(36).slice(2, 10);
  const BUCKET = "https://pokemon-dive.us-lax-4.linodeobjects.com/cinepixo/posts/x.webp";

  function insertPost(over: Record<string, unknown> = {}) {
    const row = {
      id: `p-${key()}`,
      slug: `post-${key()}`,
      title: `A Headline ${key()}`,
      content: "Body.",
      category: "CRAFT",
      status: "DRAFT",
      publishedAt: null,
      tags: [],
      sources: [],
      viewCount: 0,
      authorId: USER,
      ...over,
    };
    // A hero always carries alt text — `Post_image_needs_alt`. Supplied here so
    // that every test about *some other* image rule can set an image without
    // restating this one; the tests that are about alt pass it explicitly.
    if (row.image && !("imageAlt" in over)) {
      (row as Record<string, unknown>).imageAlt = "What the picture shows";
    }
    const cols = Object.keys(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    return db.query(
      `INSERT INTO "Post" (${cols.map((c) => `"${c}"`).join(", ")}, "updatedAt")
       VALUES (${placeholders}, CURRENT_TIMESTAMP)`,
      Object.values(row) as never[],
    );
  }

  const PUBLISHED = { status: "PUBLISHED", publishedAt: new Date("2026-08-05") };

  describe("claims about people must be sourced", () => {
    it.each(["PEOPLE", "ISSUE"])(
      "refuses a published %s post with an empty sources array",
      async (category) => {
        // Post_claims_are_sourced
        await rejects(() => insertPost({ category, ...PUBLISHED }), SQLSTATE.check);
      },
    );

    it.each(["PEOPLE", "ISSUE"])("allows a %s draft with nothing cited yet", async (category) => {
      // Drafting is where the reporting happens; the bar is at publication.
      await expect(insertPost({ category, status: "DRAFT" })).resolves.toBeTruthy();
    });

    it.each(["PEOPLE", "ISSUE"])("publishes %s once a source exists", async (category) => {
      await expect(
        insertPost({ category, ...PUBLISHED, sources: ["https://example.com/x"] }),
      ).resolves.toBeTruthy();
    });

    it.each(["INDUSTRY", "CRAFT", "WATCHLIST"])(
      "leaves %s free to publish uncited — it is our own reading",
      async (category) => {
        await expect(insertPost({ category, ...PUBLISHED })).resolves.toBeTruthy();
      },
    );
  });

  describe("status and publishedAt are paired", () => {
    // Post_published_has_date — every shelf and feed sorts on this column.
    it("refuses PUBLISHED with no date", async () => {
      await rejects(
        () => insertPost({ status: "PUBLISHED", publishedAt: null }),
        SQLSTATE.check,
      );
    });

    it("refuses DRAFT carrying a date", async () => {
      await rejects(
        () => insertPost({ status: "DRAFT", publishedAt: new Date("2026-08-05") }),
        SQLSTATE.check,
      );
    });
  });

  describe("identity", () => {
    it.each(["Uppercase", "double--hyphen", "-leading", "trailing-", "a/b", "a b", ""])(
      "refuses the slug %p",
      async (slug) => {
        await rejects(() => insertPost({ slug }), SQLSTATE.check);
      },
    );

    it("refuses two posts with the same slug", async () => {
      const slug = `post-${key()}`;
      await insertPost({ slug });
      await rejects(() => insertPost({ slug }), SQLSTATE.unique);
    });

    it("refuses two headlines differing only in case", async () => {
      // Post_title_lower_key. The admin screen checks for clashes
      // case-insensitively, so the database has to agree or the check is advice.
      const title = `The Same Headline ${key()}`;
      await insertPost({ title });
      await rejects(() => insertPost({ title: title.toUpperCase() }), SQLSTATE.unique);
    });

    it("refuses a blank title or body, which NOT NULL would let through", async () => {
      await rejects(() => insertPost({ title: "   " }), SQLSTATE.check);
      await rejects(() => insertPost({ content: "\n\n" }), SQLSTATE.check);
    });

    it("refuses a whitespace-only standfirst", async () => {
      await rejects(() => insertPost({ dek: "  " }), SQLSTATE.check);
      await expect(insertPost({ dek: null })).resolves.toBeTruthy();
    });

    it("refuses a category that is not one of the five", async () => {
      await rejects(() => insertPost({ category: "GOSSIP" }), SQLSTATE.badEnum);
    });

    it("refuses a negative view counter", async () => {
      await rejects(() => insertPost({ viewCount: -1 }), SQLSTATE.check);
    });
  });

  describe("the hero image is ours or nothing", () => {
    it("accepts our own origin and our own bucket", async () => {
      await expect(insertPost({ image: "/uploads/posts/2026/08/x.webp" })).resolves.toBeTruthy();
      await expect(insertPost({ image: BUCKET })).resolves.toBeTruthy();
    });

    it.each([
      "https://image.tmdb.org/t/p/w500/x.jpg",
      "https://example.com/press-photo.jpg",
      "https://pokemon-dive.us-lax-4.linodeobjects.com/elsewhere/x.webp",
    ])("refuses the hotlink %s", async (image) => {
      // Post_image_is_ours. This is the constraint that keeps a photograph we
      // hold no licence for from reaching a page.
      await rejects(() => insertPost({ image }), SQLSTATE.check);
    });

    it("refuses a licence with no source page", async () => {
      await rejects(
        () => insertPost({ image: BUCKET, imageLicense: "CC BY-SA 4.0" }),
        SQLSTATE.check,
      );
    });

    it("accepts an operator upload that states no licence", async () => {
      // The billboard case: our own file, no licence claimed, so nothing to cite.
      await expect(
        insertPost({ image: BUCKET, imageCredit: "CinePixo" }),
      ).resolves.toBeTruthy();
    });

    it("refuses alt text or credit with no file to describe", async () => {
      await rejects(() => insertPost({ imageAlt: "A face" }), SQLSTATE.check);
      await rejects(() => insertPost({ imageCredit: "Someone" }), SQLSTATE.check);
    });
  });

  /**
   * The other direction, which went unenforced for the blog's whole life.
   *
   * `alt=""` does not mean "no description available" — it means "this picture
   * is decorative, skip it". Rendering that over a photograph of the person the
   * piece is about removes the subject of the article from the page for the
   * reader who most needs it named.
   */
  describe("a hero carries alt text", () => {
    it("refuses a picture with no description", async () => {
      // Post_image_needs_alt
      await rejects(() => insertPost({ image: BUCKET, imageAlt: null }), SQLSTATE.check);
    });

    it.each(["", "   ", "\n\t "])("refuses blank alt text %j", async (imageAlt) => {
      // Blank is not absent. The same lesson as Post_content_meaningful, which
      // passed a body of newlines until a constraint test caught it.
      await rejects(() => insertPost({ image: BUCKET, imageAlt }), SQLSTATE.check);
    });

    it("accepts a picture that says what it shows", async () => {
      await expect(
        insertPost({ image: BUCKET, imageAlt: "Anne Hathaway at a premiere" }),
      ).resolves.toBeTruthy();
    });

    it("has nothing to say about a post with no picture", async () => {
      await expect(insertPost({ image: null, imageAlt: null })).resolves.toBeTruthy();
    });
  });

  describe("subject links", () => {
    async function newPerson(): Promise<string> {
      const id = `pe-${key()}`;
      await db.query(
        `INSERT INTO "Person" ("id","slug","name","occupations","updatedAt")
         VALUES ($1,$2,'A Person',ARRAY[]::TEXT[],CURRENT_TIMESTAMP)`,
        [id, `person-${key()}`],
      );
      return id;
    }

    async function newPost(): Promise<string> {
      const id = `p-${key()}`;
      await insertPost({ id });
      return id;
    }

    it("refuses a link to a person who does not exist", async () => {
      const post = await newPost();
      await rejects(
        () =>
          db.query(`INSERT INTO "PostPerson" ("postId","personId") VALUES ($1,'nobody')`, [post]),
        SQLSTATE.fk,
      );
    });

    it("refuses the same person twice on one post", async () => {
      const [post, person] = await Promise.all([newPost(), newPerson()]);
      const link = () =>
        db.query(`INSERT INTO "PostPerson" ("postId","personId") VALUES ($1,$2)`, [post, person]);
      await expect(link()).resolves.toBeTruthy();
      await rejects(link, SQLSTATE.unique);
    });

    it("deletes links with the post, and leaves the person alone", async () => {
      const [post, person] = await Promise.all([newPost(), newPerson()]);
      await db.query(`INSERT INTO "PostPerson" ("postId","personId") VALUES ($1,$2)`, [
        post,
        person,
      ]);
      await db.query(`DELETE FROM "Post" WHERE "id" = $1`, [post]);
      const { rows: links } = await db.query(`SELECT 1 FROM "PostPerson" WHERE "postId" = $1`, [
        post,
      ]);
      expect(links).toHaveLength(0);
      const { rows: people } = await db.query(`SELECT 1 FROM "Person" WHERE "id" = $1`, [person]);
      expect(people).toHaveLength(1);
    });

    it("deletes links with the person, so a post cannot cite a ghost", async () => {
      const [post, person] = await Promise.all([newPost(), newPerson()]);
      await db.query(`INSERT INTO "PostPerson" ("postId","personId") VALUES ($1,$2)`, [
        post,
        person,
      ]);
      await db.query(`DELETE FROM "Person" WHERE "id" = $1`, [person]);
      const { rows } = await db.query(`SELECT 1 FROM "PostPerson" WHERE "personId" = $1`, [person]);
      expect(rows).toHaveLength(0);
    });

    it("deletes a post with its author, as reviews are", async () => {
      // Post.authorId cascades: an account removal takes its writing with it,
      // which is the same contract Review has.
      const { rows } = await db.query<{ confdeltype: string }>(
        `SELECT confdeltype FROM pg_constraint WHERE conname = 'Post_authorId_fkey'`,
      );
      expect(rows[0]?.confdeltype).toBe("c");
    });
  });
});

describe("trigram indexes exist for search", () => {
  it("indexes Movie.title, Review.title and Post.title with GIN/trgm", async () => {
    // /search uses `contains`; without these every query is a sequential scan.
    const { rows } = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE indexname IN ('Movie_title_trgm','Review_title_trgm','Post_title_trgm')`,
    );
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      "Movie_title_trgm",
      "Post_title_trgm",
      "Review_title_trgm",
    ]);
  });
});
