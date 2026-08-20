// GET /critics/{slug}.md — the critic profile, as a document.
//
// Same contract as the review, movie, person, topic and blog endpoints: outside
// /api/ so robots.txt does not disallow it, `text/markdown`, and a `Link:
// rel="canonical"` back at the HTML page so the pair never competes.
import { prisma } from "@cinepixo/db";
import { criticToMarkdown, markdownResponse, notFoundMarkdown } from "@/lib/markdown-export";

export const dynamic = "force-dynamic";

interface CriticLink {
  label: string;
  url: string;
}

/**
 * `links` is a JSON column holding data somebody typed, so it is validated here
 * exactly as it is on the page: only entries with a string label and an http(s)
 * URL survive. A stored `javascript:` URL must not become a link in a document
 * that other people's tooling will render.
 */
function parseLinks(raw: unknown): CriticLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is CriticLink =>
      typeof (l as CriticLink)?.label === "string" &&
      typeof (l as CriticLink)?.url === "string" &&
      /^https?:\/\//.test((l as CriticLink).url),
  );
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,130}$/.test(slug)) return notFoundMarkdown();

  const critic = await prisma.critic.findUnique({ where: { slug } });
  if (!critic) return notFoundMarkdown();

  return markdownResponse(
    criticToMarkdown({
      slug: critic.slug,
      name: critic.name,
      bio: critic.bio,
      links: parseLinks(critic.links),
      avatarUrl: critic.avatarUrl,
      avatarCredit: critic.avatarCredit,
      avatarLicense: critic.avatarLicense,
      avatarSourceUrl: critic.avatarSourceUrl,
      updatedAt: critic.updatedAt,
    }),
    { canonicalPath: `/critics/${critic.slug}` },
  );
}
