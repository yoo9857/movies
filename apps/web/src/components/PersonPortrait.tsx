// A person's face, in the one treatment the whole site uses.
//
// Three states in a deliberate order:
//
//   1. `image` — an object on our storage, put there by the upload pipeline.
//      This is the only thing that renders as a photograph.
//   2. `tmdbProfilePath` — a source we have not imported yet. Rendered so a
//      half-filled library is still readable, and so the gap is visibly
//      *temporary* rather than looking like a decision.
//   3. neither — the house monogram, which is a presentation and not a
//      placeholder. Initials in brand gold read as intent; a grey silhouette
//      reads as breakage.
//
// The mixed state is the one that looks broken — some faces, some blanks — so
// the monogram is styled to hold its own next to a photograph rather than
// apologise for not being one.
import Image from "next/image";
import { monogram } from "@/lib/monogram";

export interface PortraitSubject {
  name: string;
  image?: string | null;
  tmdbProfilePath?: string | null;
}

export function PersonPortrait({
  person,
  size = 96,
  className = "",
  priority = false,
}: {
  person: PortraitSubject;
  /** Rendered width in px; the frame is square. */
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  const shell = `relative overflow-hidden rounded-full border border-line ${className}`;
  const src =
    person.image ??
    (person.tmdbProfilePath
      ? `https://image.tmdb.org/t/p/w342${person.tmdbProfilePath}`
      : null);

  if (!src) {
    return (
      <div
        className={`${shell} grid place-items-center bg-surface-raised`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <span
          className="font-mono font-bold tracking-tight text-accent/85"
          style={{ fontSize: Math.round(size * 0.34) }}
        >
          {monogram(person.name)}
        </span>
      </div>
    );
  }

  return (
    <div className={shell} style={{ width: size, height: size }}>
      <Image
        src={src}
        alt={person.name}
        width={size}
        height={size}
        sizes={`${size}px`}
        priority={priority}
        // Faces sit high in a frame; a centred square crop cuts the chin.
        className="h-full w-full object-cover object-top"
      />
    </div>
  );
}
