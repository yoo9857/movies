import { prisma } from "@cinepixo/db";
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * People in *our* database, by name — for pickers that need a `Person.id`.
 *
 * Distinct from `…/people/search`, which searches TMDB to find a face to import
 * and returns tmdbIds. This one never leaves the building: it answers "which of
 * our rows is this", which is what linking a blog post to a person requires.
 * (It is also the only one that answers at all — no TMDB key is configured.)
 *
 * Served by `Person_name_trgm`, so `contains` is an index scan rather than a
 * sequential read of two hundred thousand rows.
 */
export const GET = handle(async (request: Request) => {
  await requireAdmin();
  rateLimit(`person-lookup:${clientIp(request)}`, 90, 60_000);

  const q = z
    .string()
    .trim()
    .min(1)
    .max(100)
    .parse(new URL(request.url).searchParams.get("q") ?? "");

  const people = await prisma.person.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    // The most-credited first: two people share a name and the one with a
    // filmography is almost always the one being written about.
    orderBy: [{ crewRoles: { _count: "desc" } }, { castRoles: { _count: "desc" } }],
    take: 12,
    select: {
      id: true,
      slug: true,
      name: true,
      image: true,
      occupations: true,
      _count: { select: { castRoles: true, crewRoles: true } },
    },
  });

  return json({
    people: people.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      image: p.image,
      role: p.occupations[0] ?? null,
      credits: p._count.castRoles + p._count.crewRoles,
    })),
  });
});
