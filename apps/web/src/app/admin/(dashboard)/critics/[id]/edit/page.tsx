import { prisma } from "@cinepixo/db";
import { notFound } from "next/navigation";
import { CriticForm } from "@/components/admin/CriticForm";

export const dynamic = "force-dynamic";

function parseLinks(raw: unknown): { label: string; url: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is { label: string; url: string } =>
      typeof l?.label === "string" && typeof l?.url === "string",
  );
}

export default async function EditCriticPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const critic = await prisma.critic.findUnique({ where: { id } });
  if (!critic) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold">Edit critic</h1>
      <div className="mt-6">
        <CriticForm
          criticId={critic.id}
          initial={{
            slug: critic.slug,
            name: critic.name,
            bio: critic.bio ?? "",
            avatarUrl: critic.avatarUrl ?? "",
            links: parseLinks(critic.links),
          }}
        />
      </div>
    </div>
  );
}
