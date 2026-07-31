import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import {
  breadcrumbNode,
  type Crumb,
  faqNode,
  graph,
  ORG_ID,
  pageMetadata,
  webPageNode,
} from "@/lib/seo";
import { SITE_ABOUT } from "@/lib/site";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "What CinePixo is, how its ratings work, and who writes here — the editorial rules of a site built around film criticism.";

export const metadata: Metadata = pageMetadata({
  path: "/about",
  title: "About",
  description: DESCRIPTION,
});

const TRAIL: Crumb[] = [{ name: "About" }];

/**
 * The rating rules, written as questions.
 *
 * This is the highest-leverage content on the site for answer engines: when
 * something quotes a CinePixo score, this is where it learns what the number
 * means. Every answer here restates a rule stated elsewhere on this page, so the
 * FAQ markup describes visible content rather than inventing a second version.
 */
const FAQ = [
  {
    q: "What is CinePixo?",
    a: "CinePixo is an independent, English-language site for film criticism. Members publish long-form, signed reviews of individual films, and each review carries a rating and a one-line verdict. Alongside the writing there is a film library with full credits and a directory of the critics the community follows.",
  },
  {
    q: "How does the CinePixo rating scale work?",
    a: "Reviews are scored from 0 to 10 in half-point steps and displayed on a five-star scale, so 9.5 out of 10 is shown as four and three-quarter stars. Half-points exist because the distance between a 7 and an 8 is where most disagreement actually lives.",
  },
  {
    q: "What is a fandom score?",
    a: "The fandom score for a film is the plain average of every published review's rating for it — no weighting, no secret formula. It is shown together with the distribution, because an average of four stars that splits the room is a different film from one that doesn't.",
  },
  {
    q: "How is the top-rated ranking calculated?",
    a: "Films are ranked by average rating weighted by review count, using avg × n/(n+2). The weighting means a single enthusiastic review cannot outrank a film that many writers have argued for.",
  },
  {
    q: "What are themes and motifs here?",
    a: "A theme is what a film is about — a class divide, the cost of ambition. A motif is what recurs on screen — stairs, rising water, a rehearsal room. Both are editorial: the axis, its definition and the sentence explaining how it shows up in a particular film are written by members of this site, and a film joins an axis only with that sentence attached. Imported keyword lists are shown separately and labelled as such.",
  },
  {
    q: "Who can publish a review on CinePixo?",
    a: "Any member with an account can publish. Reviews are written in Markdown, signed with the author's name, and are not ordered by an algorithmic feed — the index is chronological and the rankings are stated arithmetic.",
  },
  {
    q: "Where does the film data come from?",
    a: "From open knowledge bases, through our own import tooling: film facts from Wikidata, synopses from Wikipedia (credited under their licence on each film page), and freely licensed artwork hosted on our own origin with its credit. Reviews and ratings are the work of their authors.",
  },
];

export default async function AboutPage() {
  const critics = await prisma.critic.findMany({ orderBy: { name: "asc" } });

  const jsonLd = graph(
    webPageNode({
      path: "/about",
      name: `About CinePixo`,
      description: SITE_ABOUT,
      kind: "AboutPage",
      hasBreadcrumb: true,
      aboutId: ORG_ID,
      speakableSelectors: ["[data-speakable]"],
    }),
    breadcrumbNode("/about", TRAIL),
    faqNode("/about", FAQ),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <JsonLd data={jsonLd} />
      {/* ① Manifesto — deliberately image-free: pure typography */}
      <header className="border-b border-line py-16 text-center sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          About CinePixo
        </p>
        <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
          We grew up on Ebert reviews<span className="text-accent">.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted">
          CinePixo is a fandom home for people who love film <em>criticism</em> as much as film —
          who read the review after the credits, argue about half-stars, and believe a great piece
          of writing can change how you see a movie.
        </p>
      </header>

      {/* ② What we do */}
      <section className="grid gap-x-10 gap-y-8 border-b border-line py-12 sm:grid-cols-3">
        {[
          {
            n: "01",
            t: "We write reviews",
            d: "Every member can publish. Long-form, markdown, no algorithmic feed deciding what matters.",
          },
          {
            n: "02",
            t: "We argue in stars",
            d: "Ratings with distributions, not just averages — a 4.8 that splits the room is more interesting than one that doesn't.",
          },
          {
            n: "03",
            t: "We honor the critics",
            d: "Profiles for the writers and voices who taught this fandom how to watch.",
          },
        ].map((item) => (
          <div key={item.n}>
            <p className="font-mono text-sm text-accent">{item.n}</p>
            <h2 className="mt-2 text-lg font-semibold">{item.t}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.d}</p>
          </div>
        ))}
      </section>

      {/* ③ The rules, in the open — and in the exact words the FAQ markup uses,
             so anything quoting a CinePixo score quotes the real definition. */}
      <section className="border-b border-line py-12" data-speakable>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          How this works
        </h2>
        <dl className="mt-6 space-y-0">
          {FAQ.map((row) => (
            <div
              key={row.q}
              className="flex flex-col gap-1.5 border-b border-line py-5 first:border-t sm:flex-row sm:gap-8"
            >
              <dt className="shrink-0 text-sm font-semibold leading-relaxed text-accent sm:w-56 sm:pt-px">
                {row.q}
              </dt>
              <dd className="text-sm leading-relaxed text-foreground/90">{row.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ④ Critics wall */}
      {critics.length > 0 && (
        <section className="border-b border-line py-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            The critics we celebrate
          </h2>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-3">
            {critics.map((c) => (
              <Link
                key={c.slug}
                href={`/critics/${c.slug}`}
                className="text-2xl font-semibold tracking-tight text-foreground/85 transition-colors hover:text-accent"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ⑤ Contact + attribution */}
      <section className="border-b border-line py-12 text-sm leading-relaxed text-muted">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          The fine print
        </h2>
        <p className="mt-4">
          CinePixo is independently run. Questions, corrections, takedown requests:{" "}
          <a href="mailto:devoh@signpost.kr" className="text-accent hover:opacity-80">
            devoh@signpost.kr
          </a>
          .
        </p>
        <p className="mt-3">
          The library is built with our own tooling: film facts come from open knowledge bases
          (Wikidata; synopses from Wikipedia, credited under their licence on each page), the
          artwork we show is freely licensed and hosted on our own origin with its credit, and
          the taxonomy, the criticism and the code grow here — with this community. Reviews and
          ratings are the work of their authors.
        </p>
      </section>

      {/* ⑥ Join CTA */}
      <section className="py-14 text-center">
        <h2 className="text-3xl font-bold tracking-tight">
          Your take belongs here<span className="text-accent">.</span>
        </h2>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/register"
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-black hover:opacity-90"
          >
            Create an account
          </Link>
          <Link
            href="/reviews"
            className="rounded-lg border border-line px-6 py-2.5 text-sm font-semibold hover:border-accent-dim"
          >
            Read the reviews first
          </Link>
        </div>
      </section>
    </div>
  );
}
