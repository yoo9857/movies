import { prisma } from "@cinepixo/db";
import { parseJsonArray, slugSchema } from "@cinepixo/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface CriticLink {
  label: string;
  url: string;
}

function parseLinks(raw: string | null): CriticLink[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is CriticLink =>
        typeof l?.label === "string" &&
        typeof l?.url === "string" &&
        /^https?:\/\//.test(l.url), // render http/https links only
    );
  } catch {
    return [];
  }
}

async function getCritic(rawSlug: string) {
  const parsed = slugSchema.safeParse(rawSlug);
  if (!parsed.success) return null;
  return prisma.critic.findUnique({ where: { slug: parsed.data } });
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const critic = await getCritic(slug);
  return { title: critic?.name ?? "Critic not found" };
}

export default async function CriticPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const critic = await getCritic(slug);
  if (!critic) notFound();

  const links = parseLinks(critic.links);

  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">{critic.name}</h1>
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
