import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createScratchDb, dropScratchDb, scratchUrl } from "./helpers/scratch-db";

/**
 * The linker that keeps refreshes from orphaning people.
 *
 * A TMDB refresh deletes and recreates every credit row. Before the linker,
 * that severed all credit→person links — and worse, the seeded library's
 * Person rows were derived from name-only credits (tmdbId null) and have since
 * been enriched with portraits and sources; a refresh that "just created" new
 * rows would strand all of that on orphans. This test drives the real function
 * against a real PostgreSQL, because the claim-by-name behaviour is exactly
 * the part a mock would get wrong.
 */

const SUFFIX = "peoplelink";

// The prisma client must connect to the scratch database, so DATABASE_URL is
// swapped before the module singleton is created. Vitest gives each test file
// its own module registry, so this does not leak into other files.
let prismaModule: typeof import("../src/index");
let linkModule: typeof import("../src/people-link");
let pg: Awaited<ReturnType<typeof createScratchDb>>;

const MOVIE = "movie-link-test-000000";

beforeAll(async () => {
  pg = await createScratchDb(SUFFIX);
  process.env.DATABASE_URL = scratchUrl(SUFFIX)!.test;
  prismaModule = await import("../src/index");
  linkModule = await import("../src/people-link");

  await pg.query(
    `INSERT INTO "Movie" ("id","slug","title","genres","updatedAt")
     VALUES ($1,'link-test-2026','Link Test',ARRAY[]::TEXT[],CURRENT_TIMESTAMP)`,
    [MOVIE],
  );
  // The enriched, name-derived person a refresh must NOT duplicate: no tmdbId,
  // but carrying everything an admin attached.
  await pg.query(
    `INSERT INTO "Person" ("id","slug","name","image","wikidataId","bio","updatedAt")
     VALUES ('p-enriched','song-kang-ho','Song Kang-ho','/uploads/people/x.webp','Q490529','ours',CURRENT_TIMESTAMP)`,
  );
  // A person already known by TMDB id from an earlier import.
  await pg.query(
    `INSERT INTO "Person" ("id","slug","name","tmdbId","updatedAt")
     VALUES ('p-known','bong-joon-ho','Bong Joon-ho',21684,CURRENT_TIMESTAMP)`,
  );
  // A slug squatter, so creation has to take -2.
  await pg.query(
    `INSERT INTO "Person" ("id","slug","name","updatedAt")
     VALUES ('p-squat','new-face','Someone Else',CURRENT_TIMESTAMP)`,
  );

  // The state a refresh leaves behind: fresh credit rows, personId null.
  const cast = [
    [20738, "SONG KANG-HO", "Kim Ki-taek", "/song.jpg", 0], // claims p-enriched (case-insensitive)
    [99991, "New Face", "Cameo", null, 1], // must be created as new-face-2
  ] as const;
  for (const [tmdbId, name, character, profile, order] of cast) {
    await pg.query(
      `INSERT INTO "MovieCast" ("id","movieId","tmdbPersonId","name","character","profilePath","order")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`c-${tmdbId}`, MOVIE, tmdbId, name, character, profile, order],
    );
  }
  await pg.query(
    `INSERT INTO "MovieCrew" ("id","movieId","tmdbPersonId","name","job")
     VALUES ('w-21684', $1, 21684, 'Bong Joon-ho', 'Director')`,
    [MOVIE],
  );

  await linkModule.linkCreditsToPeople(prismaModule.prisma, MOVIE);
});

afterAll(async () => {
  await prismaModule?.prisma.$disconnect();
  if (pg) await dropScratchDb(pg, SUFFIX);
});

describe("after a refresh, the linker", () => {
  it("claims the enriched name-derived person instead of duplicating them", async () => {
    const { rows } = await pg.query(
      `SELECT id, "tmdbId", image, "wikidataId" FROM "Person" WHERE lower(name) = 'song kang-ho'`,
    );
    // One row, the original, now carrying the TMDB id — enrichment intact.
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("p-enriched");
    expect(rows[0].tmdbId).toBe(20738);
    expect(rows[0].image).toBe("/uploads/people/x.webp");
    expect(rows[0].wikidataId).toBe("Q490529");
  });

  it("links the credit to that claimed person", async () => {
    const { rows } = await pg.query(
      `SELECT "personId" FROM "MovieCast" WHERE "tmdbPersonId" = 20738`,
    );
    expect(rows[0].personId).toBe("p-enriched");
  });

  it("reuses a person already known by TMDB id", async () => {
    const { rows } = await pg.query(
      `SELECT "personId" FROM "MovieCrew" WHERE "tmdbPersonId" = 21684`,
    );
    expect(rows[0].personId).toBe("p-known");
    const count = await pg.query(`SELECT count(*) FROM "Person" WHERE "tmdbId" = 21684`);
    expect(count.rows[0].count).toBe("1");
  });

  it("creates a genuinely new person, stepping past a taken slug", async () => {
    const { rows } = await pg.query(
      `SELECT slug, "tmdbId", "tmdbProfilePath" FROM "Person" WHERE "tmdbId" = 99991`,
    );
    expect(rows).toHaveLength(1);
    // "new-face" belongs to Someone Else; the new row takes the next slug.
    expect(rows[0].slug).toBe("new-face-2");
  });

  it("leaves no credit unlinked", async () => {
    const { rows } = await pg.query(
      `SELECT
        (SELECT count(*) FROM "MovieCast" WHERE "movieId" = $1 AND "personId" IS NULL) AS cast_unlinked,
        (SELECT count(*) FROM "MovieCrew" WHERE "movieId" = $1 AND "personId" IS NULL) AS crew_unlinked`,
      [MOVIE],
    );
    expect(rows[0].cast_unlinked).toBe("0");
    expect(rows[0].crew_unlinked).toBe("0");
  });

  it("is idempotent — a second run changes nothing", async () => {
    const linked = await linkModule.linkCreditsToPeople(prismaModule.prisma, MOVIE);
    expect(linked).toBe(0);
    const count = await pg.query(`SELECT count(*) FROM "Person"`);
    expect(count.rows[0].count).toBe("4");
  });
});

/**
 * The same function against credits that came from Wikidata.
 *
 * These carry a Q-id and no TMDB id, which the linker did not previously admit
 * existed — the column was required and identity was resolved by it alone. The
 * bulk import fills the library from Wikidata, so this is now the path most
 * credits arrive on, and the claim-rather-than-duplicate rule has to hold for it
 * too: `p-enriched` below is the person an admin has already written about.
 */
describe("credits that came from Wikidata", () => {
  const FILM = "movie-wd-test-00000000";

  beforeAll(async () => {
    await pg.query(
      `INSERT INTO "Movie" ("id","slug","title","genres","updatedAt")
       VALUES ($1,'wd-test-2026','Wikidata Test',ARRAY[]::TEXT[],CURRENT_TIMESTAMP)`,
      [FILM],
    );
    // Same person as the enriched fixture above (Q490529), reached by Q-id.
    await pg.query(
      `INSERT INTO "MovieCast" ("id","movieId","wikidataPersonId","name","character","order")
       VALUES ('wc-1', $1, 'Q490529', 'Song Kang-ho', 'Kim Ki-taek', 0)`,
      [FILM],
    );
    // A Q-id nobody here knows yet, plus a name that collides with an existing
    // person who has no Q-id — the claim path, from the other direction.
    await pg.query(
      `INSERT INTO "MovieCast" ("id","movieId","wikidataPersonId","name","order")
       VALUES ('wc-2', $1, 'Q1122334', 'Someone Else', 1)`,
      [FILM],
    );
    // A credit with no id at all, as the pre-API seeds wrote them.
    await pg.query(
      `INSERT INTO "MovieCrew" ("id","movieId","name","job")
       VALUES ('ww-1', $1, 'Nameless Only', 'Editor')`,
      [FILM],
    );
    await linkModule.linkCreditsToPeople(prismaModule.prisma, FILM);
  });

  it("resolves a Q-id to the person already carrying it, without duplicating", async () => {
    const { rows } = await pg.query(
      `SELECT "personId" FROM "MovieCast" WHERE id = 'wc-1'`,
    );
    expect(rows[0].personId).toBe("p-enriched");
    const count = await pg.query(
      `SELECT count(*) FROM "Person" WHERE "wikidataId" = 'Q490529'`,
    );
    expect(count.rows[0].count).toBe("1");
  });

  it("claims a person who has no Q-id yet rather than creating a second one", async () => {
    // "Someone Else" is the slug squatter from the fixture above: no ids at all.
    const { rows } = await pg.query(
      `SELECT id, "wikidataId" FROM "Person" WHERE name = 'Someone Else'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("p-squat");
    expect(rows[0].wikidataId).toBe("Q1122334");
  });

  it("still handles a credit with no id but a name", async () => {
    const { rows } = await pg.query(
      `SELECT c."personId", p.name, p."tmdbId", p."wikidataId"
         FROM "MovieCrew" c JOIN "Person" p ON p.id = c."personId"
        WHERE c.id = 'ww-1'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Nameless Only");
    expect(rows[0].tmdbId).toBeNull();
    expect(rows[0].wikidataId).toBeNull();
  });

  it("leaves nothing unlinked, and repeats without effect", async () => {
    const unlinked = await pg.query(
      `SELECT
        (SELECT count(*) FROM "MovieCast" WHERE "movieId" = $1 AND "personId" IS NULL) AS c,
        (SELECT count(*) FROM "MovieCrew" WHERE "movieId" = $1 AND "personId" IS NULL) AS w`,
      [FILM],
    );
    expect(unlinked.rows[0].c).toBe("0");
    expect(unlinked.rows[0].w).toBe("0");
    expect(await linkModule.linkCreditsToPeople(prismaModule.prisma, FILM)).toBe(0);
  });
});
