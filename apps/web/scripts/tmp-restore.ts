// One-off: put a post's prose back from the job file that created it.
//
// The reset's heading cleanup removed every `##` in this piece. The prose is
// unharmed in deploy-jobs/, so the repair is to write it back and re-place the
// pictures — not to retype anything.
import "../../../packages/db/prisma/env";
import { readFileSync } from "node:fs";
import { prisma } from "@cinepixo/db";

const [SLUG, JOB] = process.argv.slice(2);

async function main() {
  if (!SLUG || !JOB) throw new Error("usage: tmp-restore.ts <slug> <draft.json>");
  const [job] = JSON.parse(readFileSync(JOB, "utf8")) as { content: string }[];
  if (!job?.content) throw new Error("no content in that job file");

  const post = await prisma.post.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!post) throw new Error("no post with that slug");

  await prisma.post.update({ where: { id: post.id }, data: { content: `${job.content.trim()}\n` } });
  const headings = [...job.content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
  console.log(`restored ${headings.length} heading(s):`);
  for (const h of headings) console.log(`  ${h}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
