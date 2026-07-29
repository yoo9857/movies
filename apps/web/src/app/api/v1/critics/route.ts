import { prisma } from "@cinepixo/db";
import { handle, json } from "@/lib/api";

export const GET = handle(async () => {
  const critics = await prisma.critic.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, bio: true, avatarUrl: true, links: true },
  });
  return json({ critics });
});
