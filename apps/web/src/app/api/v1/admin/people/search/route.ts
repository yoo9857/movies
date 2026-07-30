import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { searchPeople } from "@/lib/tmdb";

/**
 * Candidates for "who is this credit, and is there a face for them?"
 *
 * Discovery only. The response carries a thumbnail URL so an admin can tell two
 * people with the same name apart — that is the one place a foreign image URL
 * legitimately reaches the browser, because it is a contact sheet in a private
 * tool, not a page we publish. Picking one goes through `…/[id]/link`, which
 * pulls the portrait into our own storage.
 */
export const GET = handle(async (request: Request) => {
  await requireAdmin();
  rateLimit(`person-search:${clientIp(request)}`, 60, 60_000);

  const q = z
    .string()
    .trim()
    .min(1)
    .max(100)
    .parse(new URL(request.url).searchParams.get("q") ?? "");

  const results = await searchPeople(q);

  return json({
    results: results.map((p) => ({
      tmdbId: p.id,
      name: p.name,
      department: p.known_for_department,
      // Small — this is a picker, not a gallery.
      thumbnail: p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null,
      hasPhoto: Boolean(p.profile_path),
      knownFor: (p.known_for ?? [])
        .map((k) => k.title ?? k.name)
        .filter((t): t is string => Boolean(t))
        .slice(0, 3),
    })),
  });
});
