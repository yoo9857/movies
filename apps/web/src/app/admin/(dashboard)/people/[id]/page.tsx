import { prisma } from "@cinepixo/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonForm } from "@/components/admin/PersonForm";
import { PersonIdentityFinder } from "@/components/admin/PersonIdentityFinder";
import { PersonPhotoManager } from "@/components/admin/PersonPhotoManager";
import { WikiEnricher } from "@/components/admin/WikiEnricher";
import { PersonPortrait } from "@/components/PersonPortrait";

export const dynamic = "force-dynamic";

/** A date column rendered for a `<input type="date">`, which wants YYYY-MM-DD. */
const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default async function AdminPersonPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      castRoles: {
        include: { movie: { select: { slug: true, title: true, releaseDate: true } } },
      },
      crewRoles: {
        include: { movie: { select: { slug: true, title: true, releaseDate: true } } },
      },
    },
  });
  if (!person) notFound();

  const links = Array.isArray(person.links)
    ? (person.links as { label?: string; url?: string }[]).map((l) => ({
        label: typeof l?.label === "string" ? l.label : "",
        url: typeof l?.url === "string" ? l.url : "",
      }))
    : [];

  const credits = [
    ...person.castRoles.map((c) => ({
      id: c.id,
      movie: c.movie,
      role: c.character ?? "Actor",
    })),
    ...person.crewRoles.map((c) => ({ id: c.id, movie: c.movie, role: c.job })),
  ].sort(
    (a, b) =>
      (b.movie.releaseDate ? new Date(b.movie.releaseDate).getFullYear() : 0) -
      (a.movie.releaseDate ? new Date(a.movie.releaseDate).getFullYear() : 0),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <PersonPortrait person={person} size={72} />
          <div>
            <h1 className="text-2xl font-bold">{person.name}</h1>
            <Link
              href={`/people/${person.slug}`}
              className="font-mono text-xs text-muted hover:text-accent"
            >
              /people/{person.slug} ↗
            </Link>
          </div>
        </div>
        <Link href="/admin/people" className="text-sm text-muted hover:text-foreground">
          ← All people
        </Link>
      </div>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Portrait</h2>
        <p className="mt-1 text-xs text-muted">
          {person.image
            ? "Ours — an object on our storage."
            : person.tmdbProfilePath
              ? "Not imported yet; the page is showing the source until it is."
              : "No source anywhere. This one is ours to find."}
        </p>
        <div className="mt-3 space-y-3">
          <PersonPhotoManager personId={person.id} hasImage={Boolean(person.image)} />
          {/* Wikipedia first: no key needed, the photograph is licensed, and the
              facts come with it. The film database is the fallback. */}
          <WikiEnricher
            personId={person.id}
            name={person.name}
            linked={person.wikidataId !== null}
          />
          <PersonIdentityFinder
            personId={person.id}
            name={person.name}
            linked={person.tmdbId !== null}
          />
        </div>
        {person.imageCredit && (
          <p className="mt-3 text-[11px] text-muted">
            Credit stored: {person.imageCredit}
            {person.imageLicense ? ` · ${person.imageLicense}` : ""}
          </p>
        )}
      </section>

      <PersonForm
        personId={person.id}
        initial={{
          slug: person.slug,
          name: person.name,
          bio: person.bio ?? "",
          notes: person.notes ?? "",
          birthPlace: person.birthPlace ?? "",
          birthDate: day(person.birthDate),
          deathDate: day(person.deathDate),
          links,
        }}
      />

      <section>
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Credits · {credits.length}
        </h2>
        <div className="mt-2 border-t border-line">
          {credits.map((c) => (
            <div
              key={c.id}
              className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-sm"
            >
              <Link href={`/movies/${c.movie.slug}`} className="truncate hover:text-accent">
                {c.movie.title}
                {c.movie.releaseDate && (
                  <span className="ml-2 font-mono text-[11px] text-muted">
                    {new Date(c.movie.releaseDate).getFullYear()}
                  </span>
                )}
              </Link>
              <span className="shrink-0 font-mono text-[11px] text-muted">{c.role}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
