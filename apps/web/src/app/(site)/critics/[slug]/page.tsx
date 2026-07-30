import { prisma } from "@cinepixo/db";
import { slugSchema } from "@cinepixo/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import {
  breadcrumbNode,
  criticEntityId,
  criticNode,
  type Crumb,
  graph,
  pageMetadata,
  webPageNode,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

interface CriticLink {
  label: string;
  url: string;
}

// links is a JSON column of external data: validate every entry, and render
// only http/https so a stored javascript: URL can never become a live link.
function parseLinks(raw: unknown): CriticLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is CriticLink =>
      typeof (l as CriticLink)?.label === "string" &&
      typeof (l as CriticLink)?.url === "string" &&
      /^https?:\/\//.test((l as CriticLink).url),
  );
}

// `cache` so the metadata pass and the render share one query instead of two.
const getCritic = cache(async (rawSlug: string) => {
  const parsed = slugSchema.safeParse(rawSlug);
  if (!parsed.success) return null;
  return prisma.critic.findUnique({ where: { slug: parsed.data } });
});

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const critic = await getCritic(slug);
  // Thrown here, not just in the page: for bots with blocking metadata this is
  // what turns a missing critic into a real 404 instead of a soft one.
  if (!critic) notFound();

  return pageMetadata({
    path: `/critics/${critic.slug}`,
    title: critic.name,
    description:
      critic.bio ?? `${critic.name} — a film critic followed by the CinePixo community.`,
    ogType: "profile",
    images: critic.avatarUrl ? [{ url: critic.avatarUrl, alt: critic.name }] : [],
    keywords: [critic.name, `${critic.name} film critic`, "film criticism"],
  });
}

export default async function CriticPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const critic = await getCritic(slug);
  if (!critic) notFound();

  const links = parseLinks(critic.links);
  const path = `/critics/${critic.slug}`;
  const trail: Crumb[] = [{ name: "Critics", path: "/critics" }, { name: critic.name }];

  // A named person with off-site links is the clearest entity on the site, and
  // the one most worth getting right: `sameAs` pointing at their own bylines is
  // what ties this profile to the same human in a knowledge graph.
  const jsonLd = graph(
    webPageNode({
      path,
      name: critic.name,
      description: critic.bio,
      kind: "ProfilePage",
      image: critic.avatarUrl,
      dateModified: critic.updatedAt,
      hasBreadcrumb: true,
      mainEntityId: criticEntityId(critic.slug),
      aboutId: criticEntityId(critic.slug),
    }),
    breadcrumbNode(path, trail),
    criticNode({ ...critic, links }),
  );

  return (
    <article className="mx-auto max-w-2xl">
      <JsonLd data={jsonLd} />
      <Breadcrumbs trail={trail} />
      <h1 className="mt-2.5 text-3xl font-bold">{critic.name}</h1>
      {critic.bio && <p className="mt-4 leading-relaxed text-foreground/90">{critic.bio}</p>}
      {links.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-3">
          {links.map((l) => (
            <li key={l.url}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-dim hover:text-foreground"
              >
                {l.label} ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
