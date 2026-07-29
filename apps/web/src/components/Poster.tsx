import Image from "next/image";

export function Poster({
  path,
  title,
  className = "",
}: {
  path: string | null;
  title: string;
  className?: string;
}) {
  if (!path || !path.startsWith("/")) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-raised text-muted text-xs ${className}`}
        aria-label={`No poster for ${title}`}
      >
        No poster
      </div>
    );
  }
  return (
    <Image
      src={`https://image.tmdb.org/t/p/w342${path}`}
      alt={`${title} poster`}
      width={342}
      height={513}
      className={`object-cover ${className}`}
    />
  );
}
