// Typographic score band — the "judgment layer". No cards: hairlines + display type.
import { toStarScale } from "@cinepixo/shared";
import { RatingHistogram } from "./RatingHistogram";

export function ScoreBand({
  ratings,
  tmdbScore,
  tmdbVotes,
}: {
  ratings: number[]; // raw 0–10 fandom ratings
  tmdbScore: number | null;
  tmdbVotes: number | null;
}) {
  const count = ratings.length;
  const fandomAvg = count > 0 ? ratings.reduce((s, r) => s + r, 0) / count : null;
  const fandomStars = fandomAvg != null ? toStarScale(fandomAvg) : null;
  const tmdbStars = tmdbScore != null ? Math.round((tmdbScore / 2) * 100) / 100 : null;
  const delta =
    fandomStars != null && tmdbStars != null
      ? Math.round((fandomStars - tmdbStars) * 100) / 100
      : null;

  // With no fandom reviews yet, the TMDB score takes the display slot
  // instead of a dangling dash.
  const heroValue = fandomStars ?? tmdbStars;
  const heroIsFandom = fandomStars != null;

  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-y border-line py-5">
      <div className="flex items-baseline gap-4">
        <span
          className={`text-6xl font-extrabold leading-none tracking-tight tabular-nums ${
            heroIsFandom ? "text-accent" : "text-foreground/80"
          }`}
          aria-label={
            heroValue != null
              ? `${heroIsFandom ? "Fandom" : "TMDB"} score ${heroValue} out of 5`
              : "Not yet rated"
          }
        >
          {heroValue != null ? heroValue.toFixed(1) : "N/A"}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {heroIsFandom
              ? `Fandom score · ${count} review${count === 1 ? "" : "s"}`
              : heroValue != null
                ? "TMDB score · awaiting fandom reviews"
                : "Unrated"}
          </span>
          {heroIsFandom && tmdbStars != null ? (
            <span className="text-sm">
              TMDB {tmdbScore!.toFixed(1)}
              <span className="text-muted">/10</span>
              {delta != null && (
                <>
                  {" "}
                  <span
                    className={`font-mono ${delta > 0 ? "text-positive" : delta < 0 ? "text-chart-alt" : "text-muted"}`}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(2)}
                  </span>{" "}
                  <span className="text-muted">
                    {delta > 0
                      ? "— the fandom rates it higher"
                      : delta < 0
                        ? "— the world rates it higher"
                        : "— in agreement"}
                  </span>
                </>
              )}
              {tmdbVotes != null && (
                <span className="text-muted"> · {tmdbVotes.toLocaleString("en-US")} votes</span>
              )}
            </span>
          ) : (
            <span className="text-sm text-muted">
              {count === 0
                ? `Be the first to rate it${
                    tmdbVotes != null ? ` — ${tmdbVotes.toLocaleString("en-US")} TMDB votes so far` : ""
                  }.`
                : "No TMDB score on file."}
            </span>
          )}
        </div>
      </div>

      {count > 0 && (
        <RatingHistogram ratings={ratings} height={56} className="ml-auto w-44 self-end" />
      )}
    </div>
  );
}
