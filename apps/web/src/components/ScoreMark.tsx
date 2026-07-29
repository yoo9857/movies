// The score, wearing the logo: a film-reel speech bubble with the number
// knocked out of it, exactly as the mark is drawn. One SVG shape, so the tail
// and the reel holes are real geometry rather than CSS approximations.
export function ScoreMark({
  value,
  tone = "fandom",
  label,
  size = 104,
}: {
  value: number; // 0–5
  tone?: "fandom" | "world";
  label?: string;
  size?: number;
}) {
  const gold = tone === "fandom";
  const fill = gold ? "var(--accent)" : "var(--surface-raised)";
  const ink = gold ? "var(--background)" : "var(--muted)";
  const stroke = gold ? "none" : "var(--border)";

  return (
    <div
      className="relative shrink-0 select-none"
      style={{ width: size, height: size * 1.16 }}
      role="img"
      aria-label={`${value.toFixed(1)} out of 5${label ? ` — ${label}` : ""}`}
    >
      <svg viewBox="0 0 100 116" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {/* bubble + tail as one filled path, then the reel holes punched out */}
        <path
          d="M50 3A45 45 0 1 0 50 93A45 45 0 1 0 50 3Z M36 80 L33 113 L58 84 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={stroke === "none" ? 0 : 2}
        />
        <circle cx="34" cy="30" r="7.5" fill={ink} opacity={gold ? 1 : 0.6} />
        <circle cx="50" cy="30" r="4.5" fill={ink} opacity={gold ? 1 : 0.6} />
        <circle cx="66" cy="30" r="7.5" fill={ink} opacity={gold ? 1 : 0.6} />
      </svg>

      {/* the number lives in HTML so it uses the site's real typography */}
      <div
        className="absolute inset-x-0 flex flex-col items-center"
        style={{ top: size * 0.4 }}
      >
        <span
          className="font-extrabold leading-none tracking-tight tabular-nums"
          style={{ fontSize: size * 0.34, color: ink }}
        >
          {value.toFixed(1)}
        </span>
        <span
          className="mt-0.5 font-mono uppercase leading-none tracking-[0.14em]"
          style={{ fontSize: Math.max(7, size * 0.082), color: ink, opacity: 0.75 }}
        >
          {gold ? "of 5" : "tmdb"}
        </span>
      </div>
    </div>
  );
}
