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
 * A credit is identified by whichever source produced it: a TMDB person id, a
 * Wikidata Q-id, or — for hand-entered rows and the pre-API seeds — nothing but
 * a name. Identity resolution, in order:
 *
 *  1. **by the id the credit carries** — unambiguous when a previous import
 *     already recorded it, whichever of the two systems it belongs to.
 *  2. **by name, case-insensitively, among rows that lack that id** — this is
 *     the claim step, and it is the whole reason this function is careful:
 *     the seeded library created people from name-only credits, and those
 *     rows have since been enriched with photographs and sources. An import
 *     that "just creates" would duplicate them and strand the enrichment on
 *     an orphan. Claiming writes the id onto the existing row instead.
 *  3. **create**, with a slug that survives collisions.
 *
 * Names alone are a weak key — two people share one often enough — so a
 * name-only credit is matched only against people who have no id in the system
 * the credit came from. That is the same trade the TMDB path always made, and it
 * is what keeps a Wikidata cast list from inventing a second Michael Caine.
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

interface Credit {
  tmdbPersonId: number | null;
  wikidataPersonId: string | null;
  name: string;
  profilePath: string | null;
}

/** One person to resolve, and the credits that asked for them. */
interface Wanted {
  tmdbPersonId: number | null;
  wikidataPersonId: string | null;
  name: string;
  profilePath: string | null;
}

/**
 * The key credits are grouped by.
 *
 * `tmdbPersonId: 0` is the sentinel the detail seeds wrote for "person unknown"
 * — it identifies nobody, so it is treated as absent rather than as a person
 * every unknown credit shares.
 */
function keyOf(c: Credit): string | null {
  if (c.tmdbPersonId != null && c.tmdbPersonId !== 0) return `tmdb:${c.tmdbPersonId}`;
  if (c.wikidataPersonId) return `wd:${c.wikidataPersonId}`;
  const name = c.name.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

export async function linkCreditsToPeople(db: Db, movieId: string): Promise<number> {
  const select = {
    tmdbPersonId: true,
    wikidataPersonId: true,
    name: true,
    profilePath: true,
  } as const;

  const [cast, crew] = await Promise.all([
    db.movieCast.findMany({ where: { movieId, personId: null }, select }),
    db.movieCrew.findMany({ where: { movieId, personId: null }, select }),
  ]);

  // One entry per distinct person, keeping the first profile path we saw.
  const wanted = new Map<string, Wanted>();
  for (const c of [...cast, ...crew]) {
    const key = keyOf(c);
    if (!key) continue;
    const existing = wanted.get(key);
    if (!existing) {
      wanted.set(key, {
        tmdbPersonId: c.tmdbPersonId !== 0 ? c.tmdbPersonId : null,
        wikidataPersonId: c.wikidataPersonId,
        name: c.name,
        profilePath: c.profilePath,
      });
      continue;
    }
    if (!existing.profilePath && c.profilePath) existing.profilePath = c.profilePath;
    // A row may carry the other system's id; keep both once they are seen.
    if (existing.tmdbPersonId == null && c.tmdbPersonId != null && c.tmdbPersonId !== 0) {
      existing.tmdbPersonId = c.tmdbPersonId;
    }
    if (!existing.wikidataPersonId && c.wikidataPersonId) {
      existing.wikidataPersonId = c.wikidataPersonId;
    }
  }

  let linked = 0;
  for (const [key, person] of wanted) {
    const { tmdbPersonId, wikidataPersonId, name, profilePath } = person;

    // 1. Already known by an id this credit carries.
    let row: { id: string } | null = null;
    if (tmdbPersonId != null) {
      row = await db.person.findUnique({ where: { tmdbId: tmdbPersonId }, select: { id: true } });
    }
    if (!row && wikidataPersonId) {
      row = await db.person.findUnique({
        where: { wikidataId: wikidataPersonId },
        select: { id: true },
      });
    }

    // 2. Claim a row that has no id in the system this credit came from, rather
    //    than duplicating someone the site has already written about.
    if (!row) {
      const claimable = await db.person.findFirst({
        where: {
          name: { equals: name.trim(), mode: "insensitive" },
          ...(tmdbPersonId != null ? { tmdbId: null } : {}),
          ...(wikidataPersonId ? { wikidataId: null } : {}),
        },
        select: { id: true, tmdbProfilePath: true },
      });
      if (claimable) {
        row = await db.person.update({
          where: { id: claimable.id },
          data: {
            ...(tmdbPersonId != null ? { tmdbId: tmdbPersonId } : {}),
            ...(wikidataPersonId ? { wikidataId: wikidataPersonId } : {}),
            // A photo seed only where none exists — never displace enrichment.
            tmdbProfilePath: claimable.tmdbProfilePath ?? profilePath,
          },
          select: { id: true },
        });
      }
    }

    // 3. A genuinely new person.
    if (!row) {
      const base = personSlug(name);
      let slug = base;
      for (let n = 2; ; n++) {
        const taken = await db.person.findUnique({ where: { slug }, select: { id: true } });
        if (!taken) break;
        slug = `${base}-${n}`;
      }
      row = await db.person.create({
        data: {
          slug,
          name: name.trim(),
          tmdbId: tmdbPersonId,
          wikidataId: wikidataPersonId,
          tmdbProfilePath: profilePath,
        },
        select: { id: true },
      });
    }

    // The same predicate the key was built from, so a name-only credit updates
    // by name and an id-bearing one by its id.
    const where = key.startsWith("tmdb:")
      ? { movieId, tmdbPersonId, personId: null }
      : key.startsWith("wd:")
        ? { movieId, wikidataPersonId, personId: null }
        : {
            movieId,
            personId: null,
            name: { equals: name.trim(), mode: "insensitive" as const },
          };

    const [castLinked, crewLinked] = await Promise.all([
      db.movieCast.updateMany({ where, data: { personId: row.id } }),
      db.movieCrew.updateMany({ where, data: { personId: row.id } }),
    ]);
    linked += castLinked.count + crewLinked.count;
  }

  return linked;
}
