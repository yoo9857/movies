// 10-bin star distribution (0.5★ … 5.0★). Server-rendered; tooltips are CSS-only.
export function RatingHistogram({
  ratings,
  height = 72,
  className = "",
}: {
  ratings: number[]; // raw 0–10 ratings
  height?: number;
  className?: string;
}) {
  const bins = Array.from({ length: 10 }, () => 0);
  for (const r of ratings) {
    // 0–10 → star halves 0.5–5.0 → bin 0..9
    const star = Math.round(r) / 2; // nearest 0.5★
    const idx = Math.min(9, Math.max(0, Math.ceil(star * 2) - 1));
    bins[idx] += 1;
  }
  const max = Math.max(1, ...bins);

  return (
    <figure className={className} aria-label="Rating distribution">
      <div className="cx-hist" style={{ height }}>
        {bins.map((count, i) => {
          const star = (i + 1) / 2;
          return (
            <div
              key={i}
              className={`cx-bar${count === 0 ? " cx-empty" : ""}`}
              style={{ height: `${Math.max(3, (count / max) * 100)}%` }}
              data-tip={`${star.toFixed(1)}★ · ${count}`}
              role="img"
              aria-label={`${star.toFixed(1)} stars: ${count} review${count === 1 ? "" : "s"}`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted">
        <span>0.5★</span>
        <span>5.0★</span>
      </div>
    </figure>
  );
}
