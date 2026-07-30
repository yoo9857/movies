import Link from "next/link";
import { PersonPortrait } from "../PersonPortrait";

/**
 * Who they keep working with, computed rather than written.
 *
 * An encyclopedia states this in prose when someone bothers to notice it. Here
 * it falls out of the credit graph: everyone sharing more than one film is a
 * working relationship, and the count is the evidence. It is the section that
 * only exists because the credits point at people instead of being loose names.
 *
 * Single shared films are excluded — on a library this size almost everyone
 * shares one, and a list of everyone is a list of nobody.
 */

export interface Collaborator {
  slug: string;
  name: string;
  image: string | null;
  tmdbProfilePath: string | null;
  /** How they are credited on the shared films, most common first. */
  role: string | null;
  sharedFilms: number;
  /** Titles, for the tooltip — the evidence behind the number. */
  titles: string[];
}

export function Collaborators({ people }: { people: Collaborator[] }) {
  if (people.length === 0) return null;

  return (
    <section>
      <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        Works with
      </h2>
      <p className="mt-1 text-xs text-muted">
        More than one film together, in this library.
      </p>
      <ul className="mt-3 space-y-1">
        {people.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/people/${c.slug}`}
              title={c.titles.join(" · ")}
              className="group flex items-center gap-2.5 rounded-lg py-1.5 transition-colors hover:bg-surface/60"
            >
              <PersonPortrait person={c} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm transition-colors group-hover:text-accent">
                  {c.name}
                </span>
                {c.role && (
                  <span className="block truncate font-mono text-[10px] text-muted">{c.role}</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-accent tabular-nums">
                ×{c.sharedFilms}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
