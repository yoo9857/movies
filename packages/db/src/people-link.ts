import type { PrismaClient, Prisma } from "./generated/client";

/**
 * Point a movie's credits at Person rows, creating or claiming as needed.
 *
 * Exists because every TMDB refresh deletes and recreates the credit rows —
 * which, before this, silently severed every credit→person link and would have
 * orphaned the enriched Person rows (portraits, Wikidata ids, our notes) the
 * moment anyone pressed Refresh. The linker runs inside the same transaction
 * as the recreate, so the graph never has a window where the credits point at
 * nobody.
 *
 * Identity resolution, in order:
 *
 *  1. **by TMDB id** — unambiguous when a previous import already recorded it.
 *  2. **by name, case-insensitively, among rows with no TMDB id** — this is
 *     the claim step, and it is the whole reason this function is careful:
 *     the seeded library created people from name-only credits, and those
 *     rows have since been enriched with photographs and sources. A refresh
 *     that "just creates" would duplicate them and strand the enrichment on
 *     an orphan. Claiming writes the TMDB id onto the existing row instead.
 *  3. **create**, with a slug that survives collisions.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Same slug grammar as the person migration: lowercase, hyphens, no accents. */
function personSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/, "");
  return base || "person";
}

export async function linkCreditsToPeople(db: Db, movieId: string): Promise<number> {
  const [cast, crew] = await Promise.all([
    db.movieCast.findMany({
      where: { movieId, personId: null, tmdbPersonId: { not: 0 } },
      select: { tmdbPersonId: true, name: true, profilePath: true },
    }),
    db.movieCrew.findMany({
      where: { movieId, personId: null, tmdbPersonId: { not: 0 } },
      select: { tmdbPersonId: true, name: true, profilePath: true },
    }),
  ]);

  // One entry per distinct person, keeping the first profile path we saw.
  const wanted = new Map<number, { name: string; profilePath: string | null }>();
  for (const c of [...cast, ...crew]) {
    const existing = wanted.get(c.tmdbPersonId);
    if (!existing) {
      wanted.set(c.tmdbPersonId, { name: c.name, profilePath: c.profilePath });
    } else if (!existing.profilePath && c.profilePath) {
      existing.profilePath = c.profilePath;
    }
  }

  let linked = 0;
  for (const [tmdbId, { name, profilePath }] of wanted) {
    // 1. Already known by id.
    let person = await db.person.findUnique({ where: { tmdbId }, select: { id: true } });

    // 2. Claim a name-derived row rather than duplicating it.
    if (!person) {
      const claimable = await db.person.findFirst({
        where: { tmdbId: null, name: { equals: name.trim(), mode: "insensitive" } },
        select: { id: true, tmdbProfilePath: true },
      });
      if (claimable) {
        person = await db.person.update({
          where: { id: claimable.id },
          data: {
            tmdbId,
            // A photo seed only where none exists — never displace enrichment.
            tmdbProfilePath: claimable.tmdbProfilePath ?? profilePath,
          },
          select: { id: true },
        });
      }
    }

    // 3. A genuinely new person.
    if (!person) {
      const base = personSlug(name);
      let slug = base;
      for (let n = 2; ; n++) {
        const taken = await db.person.findUnique({ where: { slug }, select: { id: true } });
        if (!taken) break;
        slug = `${base}-${n}`;
      }
      person = await db.person.create({
        data: { slug, name: name.trim(), tmdbId, tmdbProfilePath: profilePath },
        select: { id: true },
      });
    }

    const [castLinked, crewLinked] = await Promise.all([
      db.movieCast.updateMany({
        where: { movieId, tmdbPersonId: tmdbId, personId: null },
        data: { personId: person.id },
      }),
      db.movieCrew.updateMany({
        where: { movieId, tmdbPersonId: tmdbId, personId: null },
        data: { personId: person.id },
      }),
    ]);
    linked += castLinked.count + crewLinked.count;
  }

  return linked;
}
