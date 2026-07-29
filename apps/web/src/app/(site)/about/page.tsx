import { prisma } from "@cinepixo/db";
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About",
  description:
    "CinePixo is a fandom home for lovers of film criticism — what we do, how our ratings work, and the critics we celebrate.",
};

export default async function AboutPage() {
  const critics = await prisma.critic.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-3xl">
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

      {/* ③ Rating system — the rules, in the open */}
      <section className="border-b border-line py-12">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          How the ratings work
        </h2>
        <dl className="mt-6 space-y-0">
          {[
            {
              k: "The scale",
              v: "Reviews are scored 0–10 in half-point steps, displayed as a 5-star scale (9.5/10 = ★4.75).",
            },
            {
              k: "Fandom score",
              v: "The plain average of every published review's rating for a film. No secret sauce.",
            },
            {
              k: "Top-rated ranking",
              v: "Average star rating weighted by review count (avg × n/(n+2)), so one enthusiastic review can't outrank a loved classic.",
            },
            {
              k: "The gap",
              v: "We show our score next to TMDB's. Where the fandom disagrees with the world is where the conversation starts.",
            },
          ].map((row) => (
            <div
              key={row.k}
              className="flex flex-col gap-1 border-b border-line py-4 first:border-t sm:flex-row sm:gap-8"
            >
              <dt className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-accent sm:w-40 sm:pt-1">
                {row.k}
              </dt>
              <dd className="text-sm leading-relaxed text-foreground/90">{row.v}</dd>
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
          Film metadata, posters and stills are supplied by{" "}
          <a
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:opacity-80"
          >
            TMDB
          </a>
          . This product uses the TMDB API but is not endorsed or certified by TMDB. Reviews and
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
