import Link from "next/link";
import { PersonPortrait } from "./PersonPortrait";
import { SectionHead } from "./ReelDivider";

export interface CastEntry {
  id: string;
  name: string;
  character: string | null;
  profilePath: string | null;
  /** Set once the credit is linked to a Person; makes the name a link. */
  person?: { slug: string; image: string | null } | null;
}

export function CastRail({ cast }: { cast: CastEntry[] }) {
  if (cast.length === 0) return null;
  return (
    <section aria-label="Cast">
      <SectionHead>Cast · {cast.length}</SectionHead>
      <div className="cx-rail mt-3">
        {cast.map((c) => {
          const portrait = (
            <PersonPortrait
              person={{
                name: c.name,
                image: c.person?.image ?? null,
                tmdbProfilePath: c.profilePath,
              }}
              size={96}
              className="transition-transform group-hover:scale-[1.04]"
            />
          );
          const caption = (
            <figcaption className="mt-2 w-24">
              <p className="truncate text-xs font-medium transition-colors group-hover:text-accent">
                {c.name}
              </p>
              {c.character && <p className="truncate text-[11px] text-muted">{c.character}</p>}
            </figcaption>
          );

          // A credit we have a page for becomes a way in to the criticism on
          // that person; one we don't is still readable, just not a dead link.
          return c.person ? (
            <Link key={c.id} href={`/people/${c.person.slug}`} className="group w-24">
              <figure>{portrait}{caption}</figure>
            </Link>
          ) : (
            <figure key={c.id} className="group w-24">
              {portrait}
              {caption}
            </figure>
          );
        })}
      </div>
    </section>
  );
}
