// GET /api/v1/my/slug-check?slug=…&exclude=…
//
// Publishing used to be the first moment an author learned their slug was taken:
// the POST returns 409 after the piece is written. This lets the editor say so
// while the field is still being typed.
//
// It answers only with a boolean. That is the same fact the 409 already
// discloses, so it opens nothing new — and deliberately says nothing about whose
// review holds the slug.
import { prisma } from "@cinepixo/db";
import { slugSchema } from "@cinepixo/shared";
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const querySchema = z.object({
  slug: z.string().max(120),
  /** The review being edited, whose own slug must not count against it. */
  exclude: z.string().max(64).optional(),
});

export const GET = handle(async (request: Request) => {
  const user = await requireUser();
  rateLimit(`slug-check:${user.id}`, 120, 60_000);
  rateLimit(`slug-check-ip:${clientIp(request)}`, 300, 60_000);

  const url = new URL(request.url);
  const q = querySchema.parse({
    slug: url.searchParams.get("slug") ?? "",
    exclude: url.searchParams.get("exclude") ?? undefined,
  });

  // Malformed is a different answer from taken, and the editor says so
  // differently — one is a typo to fix, the other is a name already used.
  const parsed = slugSchema.safeParse(q.slug);
  if (!parsed.success) {
    return json({ available: false, reason: "invalid" as const });
  }

  // Drafts hold slugs too, and the publish path checks against them, so this
  // must as well or it would promise a name that then 409s.
  const taken = await prisma.review.findFirst({
    where: { slug: parsed.data, ...(q.exclude ? { NOT: { id: q.exclude } } : {}) },
    select: { id: true },
  });

  return json({ available: !taken, reason: taken ? ("taken" as const) : ("free" as const) });
});
