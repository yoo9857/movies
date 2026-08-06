// One-off: a claim the read-against-sources could not stand up.
//
// "through her representative" is not in anything I read — one URL slug hints
// at it and a hint is not a source. The rest of the sentence (the dates) is
// carried by the outlets' own publication timestamps.
import "../../../packages/db/prisma/env";
import { prisma } from "@cinepixo/db";

const SLUG = "ariana-grande-steps-back-right-when-a-screen-career-needs-her-present";
const FROM = "The announcement had come through her representative a couple of days earlier";
const TO = "The announcement had come a couple of days earlier";

async function main() {
  const post = await prisma.post.findUnique({ where: { slug: SLUG }, select: { id: true, content: true } });
  if (!post) throw new Error("no such post");
  if (!post.content.includes(FROM)) throw new Error("passage not found — already fixed?");
  await prisma.post.update({
    where: { id: post.id },
    data: { content: post.content.replace(FROM, TO) },
  });
  console.log("fixed the sourcing of the announcement sentence");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
