import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { searchMovies } from "@/lib/tmdb";

const querySchema = z.string().trim().min(1).max(100);

export const GET = handle(async (request: Request) => {
  await requireAdmin();
  rateLimit(`tmdb:${clientIp(request)}`, 30, 60_000);

  const url = new URL(request.url);
  const q = querySchema.parse(url.searchParams.get("q") ?? "");

  const results = await searchMovies(q);
  return json({ results });
});
