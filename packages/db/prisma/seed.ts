import { randomBytes } from "node:crypto";
import { prisma } from "../src/index";
import { hashPassword } from "../src/password";

async function main() {
  // Admin account — password comes from env, or a random one is generated
  // and printed ONCE so no default credential ever ships.
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@cinepixo.local";
  let adminPassword = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!adminPassword) {
    adminPassword = randomBytes(18).toString("base64url");
    generated = true;
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      username: "cinepixo",
      passwordHash: await hashPassword(adminPassword),
      role: "ADMIN",
      displayName: "CinePixo",
      bio: "Founder of CinePixo — a home for film-critic fandom.",
    },
  });

  const critic = await prisma.critic.upsert({
    where: { slug: "roger-ebert" },
    update: {},
    create: {
      slug: "roger-ebert",
      name: "Roger Ebert",
      bio: "The most influential American film critic of his era. Pulitzer Prize winner (1975), co-host of Siskel & Ebert, and patron saint of everyone who ever argued about movies on the internet.",
      links: [{ label: "RogerEbert.com", url: "https://www.rogerebert.com" }],
    },
  });

  const movie = await prisma.movie.upsert({
    where: { tmdbId: 496243 },
    update: {},
    create: {
      tmdbId: 496243,
      title: "Parasite",
      originalTitle: "기생충",
      overview:
        "All unemployed, Ki-taek's family takes peculiar interest in the wealthy and glamorous Parks for their livelihood until they get entangled in an unexpected incident.",
      posterPath: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
      releaseDate: new Date("2019-05-30"),
      runtime: 133,
      director: "Bong Joon-ho",
      genres: ["Comedy", "Thriller", "Drama"],
    },
  });

  await prisma.review.upsert({
    where: { slug: "parasite-crossing-the-line" },
    update: {},
    create: {
      slug: "parasite-crossing-the-line",
      title: "Crossing the Line — Rewatching Parasite",
      excerpt:
        "Stairs, smells, and the invisible line. How Bong Joon-ho draws class with architecture instead of dialogue.",
      content: [
        "## Space is class",
        "",
        "In *Parasite* the camera never stops moving **vertically** — from the semi-basement up to the hilltop mansion, then back down the rain-flooded stairs.",
        "",
        "The film's great trick is that it never explains class through dialogue. You *feel* it: in Mr. Park wrinkling his nose at a smell, in a rainstorm that is a blessing for one family and a catastrophe for another.",
        "",
        "## Why this rating",
        "",
        "Few films have ever fused genre thrills and social observation this seamlessly. Ebert would have given it four stars without blinking.",
      ].join("\n"),
      rating: 9.5,
      status: "PUBLISHED",
      publishedAt: new Date("2026-07-01"),
      authorId: admin.id,
      movieId: movie.id,
    },
  });

  console.log(`Seeded: admin user "${admin.username}", critic "${critic.name}", 1 movie, 1 review`);
  if (generated) {
    console.log("");
    console.log("  ADMIN LOGIN (save this — it is shown only once)");
    console.log(`  email:    ${adminEmail}`);
    console.log(`  password: ${adminPassword}`);
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
