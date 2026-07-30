import Link from "next/link";
import { toStarScale } from "@cinepixo/shared";
import { PersonPortrait } from "./PersonPortrait";

/**
 * A person as a card rather than a table row.
 *
 * The directory used to be a 36px thumbnail beside a name on a hairline — a
 * spreadsheet of people, where every one looked the same and the portrait was
 * too small to recognise anybody. Browsing faces is a visual task, so the face
 * gets the room and the numbers ride underneath it.
 *
 * The rating is only ever this site's own: the average of every published
 * review of the films they worked on. A person nobody here has written about
 * shows the invitation instead of a borrowed score — the same rule the movie
 * cards follow.
 */

export interface PersonCardData {
  slug: string;
  name: string;
  image: string | null;
  tmdbProfilePath: string | null;
  /** Distinct films in the library. */
  filmCount: number;
  /** Their most prominent job, or "Actor". */
  role: string | null;
  /** Published reviews across those films. */
  reviewCount: number;
  /** 0–10 mean of those reviews, or null when there are none. */
  fandomAvg: number | null;
}

export function PersonCard({ person }: { person: PersonCardData }) {
  const stars = person.fandomAvg != null ? toStarScale(person.fandomAvg) : null;

  return (
    <Link
      href={`/people/${person.slug}`}
      className="group flex flex-col items-center rounded-xl border border-line bg-surface p-4 text-center transition-colors hover:border-accent-dim"
    >
      <PersonPortrait
        person={person}
        size={104}
        className="transition-transform duration-300 group-hover:scale-[1.04]"
      />

      <p className="mt-3 line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover:text-accent">
        {person.name}
      </p>
      {person.role && (
        <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          {person.role}
        </p>
      )}

      <p className="mt-2.5 font-mono text-[11px] text-muted">
        {person.filmCount} film{person.filmCount === 1 ? "" : "s"}
      </p>
      {stars != null ? (
        <p className="font-mono text-[11px] text-accent">
          ★ {stars.toFixed(1)}
          <span className="text-muted"> ·{person.reviewCount}</span>
        </p>
      ) : (
        <p className="font-mono text-[11px] text-accent/70">unwritten</p>
      )}
    </Link>
  );
}
