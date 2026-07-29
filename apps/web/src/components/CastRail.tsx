import Image from "next/image";
import { SectionHead } from "./ReelDivider";

export interface CastEntry {
  id: string;
  name: string;
  character: string | null;
  profilePath: string | null;
}

export function CastRail({ cast }: { cast: CastEntry[] }) {
  if (cast.length === 0) return null;
  return (
    <section aria-label="Cast">
      <SectionHead>Cast · {cast.length}</SectionHead>
      <div className="cx-rail mt-3">
        {cast.map((c) => (
          <figure key={c.id} className="w-24">
            {c.profilePath ? (
              <Image
                src={`https://image.tmdb.org/t/p/w185${c.profilePath}`}
                alt={c.name}
                width={185}
                height={278}
                sizes="96px"
                className="aspect-2/3 w-full rounded-lg object-cover"
              />
            ) : (
              <div className="grid aspect-2/3 w-full place-items-center rounded-lg bg-surface-raised text-2xl text-muted">
                {c.name.charAt(0)}
              </div>
            )}
            <figcaption className="mt-1.5">
              <p className="truncate text-xs font-medium">{c.name}</p>
              {c.character && <p className="truncate text-[11px] text-muted">{c.character}</p>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
