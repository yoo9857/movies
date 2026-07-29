import Image from "next/image";

/**
 * A member's picture, or their initial.
 *
 * The initial is not a placeholder to be replaced later — most accounts will
 * never upload anything, so it has to look deliberate on its own.
 */
export function Avatar({
  src,
  name,
  size = 40,
  className = "",
}: {
  src: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center rounded-full bg-accent font-bold text-black ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      >
        {initial}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      sizes={`${size}px`}
      className={`shrink-0 rounded-full object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
