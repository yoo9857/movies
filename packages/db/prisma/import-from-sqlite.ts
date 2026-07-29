/**
 * One-time import of the SQLite database into PostgreSQL.
 *
 *   DATABASE_URL=postgres://…  SQLITE_PATH=./prisma/dev.db  npm run import:sqlite -w @cinepixo/db
 *
 * Design notes:
 *  · reads SQLite with raw SQL (no second Prisma client), so the old schema
 *    does not need to exist as a datamodel any more
 *  · writes in dependency order, and refuses to run against a database that
 *    already has rows — an import must never half-merge into live data
 *  · translates the shapes that changed: JSON-string lists become text[],
 *    status strings become enums, epoch milliseconds become Date
 *  · verifies row counts at the end and exits non-zero on any mismatch, so a
 *    deploy script can gate on it
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = process.env.SQLITE_PATH ?? path.join(here, "dev.db");

type Row = Record<string, unknown>;

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

/** SQLite stored DateTime as epoch milliseconds. */
const date = (v: unknown): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isFinite(n)) return new Date(n);
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

const req = (v: unknown, field: string): Date => {
  const d = date(v);
  if (!d) throw new Error(`required timestamp ${field} was empty`);
  return d;
};

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

const bool = (v: unknown): boolean => v === 1 || v === true || v === "1";

/** Lists were JSON arrays in a text column; they are text[] now. */
const list = (v: unknown): string[] => {
  if (!v) return [];
  try {
    const parsed = JSON.parse(String(v));
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** Objects stayed JSON, but must be handed over as a value, not a string. */
const json = (v: unknown): unknown => {
  if (!v) return null;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
};

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => {
  const s = String(v ?? "");
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
};

async function main() {
  const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const read = (table: string): Row[] =>
    db.prepare(`SELECT * FROM "${table}"`).all() as Row[];

  // ── Refuse to run over existing data ──
  const existing = await prisma.user.count();
  if (existing > 0 && process.env.FORCE_IMPORT !== "1") {
    throw new Error(
      `Target database already has ${existing} users. ` +
        "Refusing to import over live data — set FORCE_IMPORT=1 only if you are sure.",
    );
  }

  const src = {
    users: read("User"),
    critics: read("Critic"),
    movies: read("Movie"),
    cast: read("MovieCast"),
    crew: read("MovieCrew"),
    videos: read("MovieVideo"),
    images: read("MovieImage"),
    reviews: read("Review"),
    votes: read("ReviewVote"),
  };

  console.log(
    "Source rows:",
    Object.entries(src)
      .map(([k, v]) => `${k}=${v.length}`)
      .join(" "),
  );

  // ── Write in dependency order ──
  for (const u of src.users) {
    await prisma.user.create({
      data: {
        id: String(u.id),
        email: String(u.email).toLowerCase(),
        username: String(u.username).toLowerCase(),
        passwordHash: String(u.passwordHash),
        role: oneOf(u.role, ["ADMIN", "MEMBER"] as const, "MEMBER"),
        displayName: str(u.displayName),
        bio: str(u.bio),
        avatarUrl: str(u.avatarUrl),
        createdAt: req(u.createdAt, "User.createdAt"),
        updatedAt: req(u.updatedAt, "User.updatedAt"),
      },
    });
  }

  for (const c of src.critics) {
    await prisma.critic.create({
      data: {
        id: String(c.id),
        slug: String(c.slug),
        name: String(c.name),
        bio: str(c.bio),
        avatarUrl: str(c.avatarUrl),
        links: json(c.links) ?? undefined,
        createdAt: req(c.createdAt, "Critic.createdAt"),
        updatedAt: req(c.updatedAt, "Critic.updatedAt"),
      },
    });
  }

  for (const m of src.movies) {
    await prisma.movie.create({
      data: {
        id: String(m.id),
        tmdbId: num(m.tmdbId) ?? undefined,
        imdbId: str(m.imdbId),
        title: String(m.title),
        originalTitle: str(m.originalTitle),
        tagline: str(m.tagline),
        overview: str(m.overview),
        posterPath: str(m.posterPath),
        backdropPath: str(m.backdropPath),
        releaseDate: date(m.releaseDate),
        runtime: num(m.runtime),
        director: str(m.director),
        genres: list(m.genres),
        keywords: list(m.keywords),
        countries: list(m.countries),
        certification: str(m.certification),
        budget: num(m.budget),
        revenue: num(m.revenue),
        voteAverage: num(m.voteAverage),
        voteCount: num(m.voteCount),
        popularity: num(m.popularity),
        trailerKey: str(m.trailerKey),
        collectionId: num(m.collectionId),
        collectionName: str(m.collectionName),
        companies: json(m.companies) ?? undefined,
        homepage: str(m.homepage),
        instagram: str(m.instagram),
        facebook: str(m.facebook),
        twitter: str(m.twitter),
        createdAt: req(m.createdAt, "Movie.createdAt"),
        updatedAt: req(m.updatedAt, "Movie.updatedAt"),
      },
    });
  }

  if (src.cast.length) {
    await prisma.movieCast.createMany({
      data: src.cast.map((c) => ({
        id: String(c.id),
        movieId: String(c.movieId),
        tmdbPersonId: Number(c.tmdbPersonId ?? 0),
        name: String(c.name),
        character: str(c.character),
        profilePath: str(c.profilePath),
        order: Number(c.order ?? 0),
      })),
    });
  }

  if (src.crew.length) {
    await prisma.movieCrew.createMany({
      data: src.crew.map((c) => ({
        id: String(c.id),
        movieId: String(c.movieId),
        tmdbPersonId: Number(c.tmdbPersonId ?? 0),
        name: String(c.name),
        job: String(c.job),
        department: str(c.department),
        profilePath: str(c.profilePath),
      })),
    });
  }

  if (src.videos.length) {
    await prisma.movieVideo.createMany({
      data: src.videos.map((v) => ({
        id: String(v.id),
        movieId: String(v.movieId),
        youtubeKey: String(v.youtubeKey),
        name: String(v.name),
        type: String(v.type),
        official: bool(v.official),
        publishedAt: date(v.publishedAt),
        sort: Number(v.sort ?? 0),
      })),
    });
  }

  if (src.images.length) {
    await prisma.movieImage.createMany({
      data: src.images.map((i) => ({
        id: String(i.id),
        movieId: String(i.movieId),
        kind: oneOf(i.kind, ["poster", "backdrop"] as const, "poster"),
        path: String(i.path),
        lang: str(i.lang),
        sort: Number(i.sort ?? 0),
      })),
    });
  }

  for (const r of src.reviews) {
    const status = oneOf(r.status, ["DRAFT", "PUBLISHED"] as const, "DRAFT");
    const publishedAt = date(r.publishedAt);
    await prisma.review.create({
      data: {
        id: String(r.id),
        slug: String(r.slug),
        title: String(r.title),
        excerpt: str(r.excerpt),
        verdict: str(r.verdict),
        content: String(r.content),
        rating: Number(r.rating),
        status,
        spoilers: oneOf(r.spoilers, ["NONE", "MILD", "FULL"] as const, "NONE"),
        // The CHECK constraint pairs status with publishedAt; repair any row
        // that predates it rather than failing the whole import.
        publishedAt:
          status === "PUBLISHED"
            ? (publishedAt ?? req(r.createdAt, "Review.createdAt"))
            : null,
        viewCount: Number(r.viewCount ?? 0),
        helpfulCount: Number(r.helpfulCount ?? 0),
        authorId: String(r.authorId),
        movieId: String(r.movieId),
        createdAt: req(r.createdAt, "Review.createdAt"),
        updatedAt: req(r.updatedAt, "Review.updatedAt"),
      },
    });
  }

  if (src.votes.length) {
    await prisma.reviewVote.createMany({
      data: src.votes.map((v) => ({
        id: String(v.id),
        reviewId: String(v.reviewId),
        userId: String(v.userId),
        createdAt: req(v.createdAt, "ReviewVote.createdAt"),
      })),
    });
  }

  // ── Verify ──
  const after = {
    users: await prisma.user.count(),
    critics: await prisma.critic.count(),
    movies: await prisma.movie.count(),
    cast: await prisma.movieCast.count(),
    crew: await prisma.movieCrew.count(),
    videos: await prisma.movieVideo.count(),
    images: await prisma.movieImage.count(),
    reviews: await prisma.review.count(),
    votes: await prisma.reviewVote.count(),
  };

  let bad = 0;
  for (const [k, v] of Object.entries(after)) {
    const expected = src[k as keyof typeof src].length;
    const ok = v === expected;
    if (!ok) bad += 1;
    console.log(`${ok ? "OK  " : "FAIL"} ${k}: ${v}/${expected}`);
  }

  // The denormalised counter must agree with the rows it counts.
  const drift = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT r."id" FROM "Review" r
     WHERE r."helpfulCount" <> (SELECT COUNT(*) FROM "ReviewVote" v WHERE v."reviewId" = r."id")`,
  );
  if (drift.length) {
    console.log(`FAIL helpfulCount drift on ${drift.length} review(s)`);
    bad += 1;
  } else {
    console.log("OK   helpfulCount matches vote rows");
  }

  db.close();
  if (bad > 0) throw new Error(`${bad} verification check(s) failed`);
  console.log("\nImport verified.");
}

main()
  .catch((e) => {
    console.error("\nImport failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
