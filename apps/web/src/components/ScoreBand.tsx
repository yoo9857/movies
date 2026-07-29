// The judgment layer. The fandom score sits inside a speech bubble carrying
// the logo's reel dots — the site's most important number wears the mark.
import { toStarScale } from "@cinepixo/shared";
import { RatingHistogram } from "./RatingHistogram";
import { ScoreMark } from "./ScoreMark";

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

  // With no fandom reviews yet, the world's number takes the slot rather than
  // leaving a dash where the site's headline figure should be.
  const heroValue = fandomStars ?? tmdbStars;
  const heroIsFandom = fandomStars != null;

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-6">
      {heroValue != null ? (
        <ScoreMark
          value={heroValue}
          tone={heroIsFandom ? "fandom" : "world"}
          label={heroIsFandom ? "fandom score" : "TMDB score"}
          size={104}
        />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-dashed border-line font-mono text-[10px] uppercase tracking-widest text-muted">
          unrated
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          {heroIsFandom
            ? `${count} fandom review${count === 1 ? "" : "s"}`
            : heroValue != null
              ? "awaiting fandom reviews"
              : "unrated"}
        </span>

        {heroIsFandom && tmdbStars != null ? (
          <p className="text-sm">
            The world says{" "}
            <span className="font-semibold">
              {tmdbScore!.toFixed(1)}
              <span className="text-muted">/10</span>
            </span>
            {delta != null && (
              <>
                {" — "}
                <span
                  className={`font-mono font-semibold ${
                    delta > 0 ? "text-positive" : delta < 0 ? "text-chart-alt" : "text-muted"
                  }`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(2)}
                </span>{" "}
                <span className="text-muted">
                  {delta > 0
                    ? "in the fandom's favour"
                    : delta < 0
                      ? "against the fandom"
                      : "dead even"}
                </span>
              </>
            )}
            {tmdbVotes != null && (
              <span className="text-muted"> · {tmdbVotes.toLocaleString("en-US")} votes</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted">
            {count === 0
              ? `Nobody here has weighed in yet${
                  tmdbVotes != null
                    ? ` — the world has cast ${tmdbVotes.toLocaleString("en-US")} votes`
                    : ""
                }.`
              : "No TMDB score on file."}
          </p>
        )}
      </div>

      {count > 0 && (
        <div className="ml-auto w-full max-w-44">
          <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
            How the fandom split
          </p>
          <RatingHistogram ratings={ratings} height={52} />
        </div>
      )}
    </div>
  );
}
