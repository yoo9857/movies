// Best-effort, rights-safe picture recovery for an automatically written post.
//
//   npm run repair-post-images -w web -- --post=<slug>
//
// The normal writer gathers current Commons/Openverse photographs before it
// writes. This is the second net: it also considers the portraits and film art
// already stored by CinePixo, retries licensed search across every linked
// subject, and creates an honest house graphic when no reusable photograph
// exists. It never copies an unlicensed article image.
import "../../../packages/db/prisma/env";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@cinepixo/db";
import {
  gatherForSubjects,
  photoAlt,
  photoPlan,
  type Photo,
} from "@/lib/gather-sources";
import {
  bodyPictureUrls,
  DEFAULT_MIN_POST_PICTURES,
  postPictureCount,
} from "@/lib/post-visuals";

const strArg = (name: string): string | null => {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
};
const numArg = (name: string, fallback: number): number => {
  const raw = strArg(name);
  const value = raw == null ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
};

const POST = strArg("post");
const MINIMUM = numArg("minimum", DEFAULT_MIN_POST_PICTURES);
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const TSX = path.join(
  HERE,
  "..",
  "..",
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

interface Candidate {
  url: string;
  alt: string;
  credit?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  sourceUrl?: string | null;
  label: string;
}

function clamp(value: string | null | undefined, max = 300): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function fromPhoto(photo: Photo): Candidate {
  return {
    url: photo.url,
    alt: clamp(photoAlt(photo.description, photo.title, photo.subject))!,
    credit: clamp(photo.credit),
    license: clamp(photo.license, 200),
    licenseUrl: photo.licenseUrl,
    sourceUrl: photo.sourceUrl,
    label: `licensed search: ${photo.title}`,
  };
}

function argsFor(candidate: Candidate): string[] {
  return [
    `--url=${candidate.url}`,
    `--alt=${candidate.alt}`,
    ...(candidate.credit ? [`--credit=${candidate.credit}`] : []),
    ...(candidate.license ? [`--license=${candidate.license}`] : []),
    ...(candidate.licenseUrl ? [`--license-url=${candidate.licenseUrl}`] : []),
    ...(candidate.sourceUrl ? [`--source-url=${candidate.sourceUrl}`] : []),
  ];
}

function runFill(args: string[]): void {
  execFileSync(TSX, [path.join(HERE, "fill-post-images.ts"), ...args], {
    stdio: "inherit",
    timeout: 300_000,
  });
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function titleLines(title: string, width = 34): string[] {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (!last || (last.length + 1 + word.length > width && lines.length < 3)) lines.push(word);
    else lines[lines.length - 1] = `${last} ${word}`;
  }
  if (lines.length > 4) lines.splice(3, lines.length - 3, lines.slice(3).join(" "));
  return lines.slice(0, 4).map((line, index, all) =>
    index === all.length - 1 && line.length > 46 ? `${line.slice(0, 45).trimEnd()}…` : line,
  );
}

function fallbackSvg(title: string, category: string): string {
  const lines = titleLines(title);
  const text = lines
    .map((line, index) => `<text x="112" y="${355 + index * 94}" class="title">${xml(line)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#111827"/><stop offset="1" stop-color="#030712"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="#f59e0b" stop-opacity=".48"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/></radialGradient>
    <style>.title{fill:#f9fafb;font:700 67px Arial,sans-serif;letter-spacing:-1px}.small{fill:#fbbf24;font:700 25px Arial,sans-serif;letter-spacing:5px}.brand{fill:#d1d5db;font:600 23px Arial,sans-serif;letter-spacing:4px}</style>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/><circle cx="1390" cy="130" r="500" fill="url(#glow)"/>
  <path d="M1040 0h560v900h-260L920 0z" fill="#ffffff" opacity=".035"/><path d="M0 825h1600" stroke="#f59e0b" stroke-width="10"/>
  <text x="112" y="145" class="small">${xml(category)} · EDITORIAL</text>${text}
  <text x="112" y="770" class="brand">CINEPIXO FILM DESK</text>
  </svg>`;
}

async function current(slug: string) {
  return prisma.post.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, category: true, content: true, image: true },
  });
}

async function main(): Promise<void> {
  if (!POST) throw new Error("pass --post=<slug>");
  const post = await prisma.post.findUnique({
    where: { slug: POST },
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      content: true,
      image: true,
      people: {
        orderBy: { sort: "asc" },
        select: { person: { select: {
          name: true, image: true, imageCredit: true, imageLicense: true,
          imageLicenseUrl: true, imageSourceUrl: true,
        } } },
      },
      movies: {
        orderBy: { sort: "asc" },
        select: { movie: { select: {
          title: true, releaseDate: true, image: true, imageCredit: true,
          imageLicense: true, imageLicenseUrl: true, imageSourceUrl: true,
        } } },
      },
    },
  });
  if (!post) throw new Error(`no post with slug ${POST}`);

  const subjects = [
    ...post.people.map(({ person }) => person.name),
    ...post.movies.map(({ movie }) =>
      `${movie.title}${movie.releaseDate ? ` ${movie.releaseDate.getUTCFullYear()}` : ""}`,
    ),
  ];
  let gathered: Photo[] = [];
  if (subjects.length) {
    try {
      gathered = await gatherForSubjects(subjects, Math.max(8, MINIMUM * 2), 900);
    } catch (error) {
      // Wikimedia/Openverse being unavailable must not hide the portraits and
      // film art that are already in our own library, or the house fallback.
      console.warn(`  licensed image search unavailable · ${(error as Error).message}`);
    }
  }
  const stored: Candidate[] = [
    ...post.people.flatMap(({ person }) => person.image ? [{
      url: person.image,
      alt: person.name,
      credit: person.imageCredit,
      license: person.imageLicense,
      licenseUrl: person.imageLicenseUrl,
      sourceUrl: person.imageSourceUrl,
      label: `stored portrait: ${person.name}`,
    }] : []),
    ...post.movies.flatMap(({ movie }) => movie.image ? [{
      url: movie.image,
      alt: `${movie.title}${movie.releaseDate ? ` (${movie.releaseDate.getUTCFullYear()})` : ""}`,
      credit: movie.imageCredit,
      license: movie.imageLicense,
      licenseUrl: movie.imageLicenseUrl,
      sourceUrl: movie.imageSourceUrl,
      label: `stored film image: ${movie.title}`,
    }] : []),
  ];
  const existing = new Set([post.image, ...bodyPictureUrls(post.content)].filter(Boolean));
  const seen = new Set<string>();
  const candidates = [...stored, ...gathered.map(fromPhoto)].filter((candidate) => {
    const key = candidate.sourceUrl || candidate.url;
    if (existing.has(candidate.url) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const dir = mkdtempSync(path.join(tmpdir(), "repair-post-images-"));
  try {
    let state = await current(post.slug);
    if (!state?.image) {
      while (!state?.image && candidates.length) {
        const candidate = candidates.shift()!;
        try {
          console.log(`  image recovery hero · ${candidate.label}`);
          runFill([`--post=${post.slug}`, ...argsFor(candidate)]);
        } catch (error) {
          console.warn(`  image recovery skipped · ${(error as Error).message.split("\n")[0]}`);
        }
        state = await current(post.slug);
      }
    }

    if (!state?.image) {
      const file = path.join(dir, "cinepixo-editorial-fallback.svg");
      writeFileSync(file, fallbackSvg(post.title, post.category));
      console.log("  image recovery hero · CinePixo editorial fallback");
      runFill([
        `--post=${post.slug}`,
        `--file=${file}`,
        `--alt=CinePixo editorial graphic for ${clamp(post.title, 250)}`,
        "--credit=CinePixo",
      ]);
      state = await current(post.slug);
    }
    if (!state?.image) throw new Error("image recovery could not create a hero");

    const headings = [...state.content.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());
    while (postPictureCount(state.content, state.image) < MINIMUM && candidates.length) {
      const candidate = candidates.shift()!;
      const bodyCount = bodyPictureUrls(state.content).length;
      const plan = photoPlan(headings, Math.max(1, bodyCount + 1));
      const at = plan.length ? plan[Math.min(bodyCount, plan.length - 1)].at : undefined;
      const file = path.join(dir, `body-${bodyCount}.json`);
      writeFileSync(file, JSON.stringify([{ post: post.slug, ...argsFor(candidate).reduce<Record<string, string>>((job, arg) => {
        const [key, ...rest] = arg.slice(2).split("=");
        const jsonKey = key === "license-url" ? "licenseUrl" : key === "source-url" ? "sourceUrl" : key;
        job[jsonKey] = rest.join("=");
        return job;
      }, {}), ...(at ? { at } : {}) }]));
      try {
        console.log(`  image recovery body · ${candidate.label}`);
        runFill([`--body=${file}`, "--force"]);
      } catch (error) {
        console.warn(`  image recovery skipped · ${(error as Error).message.split("\n")[0]}`);
      }
      state = (await current(post.slug))!;
    }

    const total = postPictureCount(state.content, state.image);
    console.log(`  image recovery complete · ${total}/${MINIMUM} picture(s)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
