// The judgment layer. The fandom score sits inside a speech bubble carrying
// the logo's reel dots — the site's most important number wears the mark.
//
// This used to set the fandom average next to TMDB's public score and name the
// gap between them. That framing made the page read as a comparison shop, and it
// put a crowd average on equal footing with signed criticism. What replaces it is
// the more useful question for anyone reading criticism: how much do the writers
// here *disagree*? A 4.0 that every reviewer arrived at is a different film from a
// 4.0 averaged out of a 2 and a 5, and the range says so before the histogram
// draws it.
import { toStarScale } from "@cinepixo/shared";
import { RatingHistogram } from "./RatingHistogram";
import { ScoreMark } from "./ScoreMark";

/** How far apart the writers are, in stars, described rather than numbered. */
function spread(low: number, high: number): string {
  const range = high - low;
  if (range >= 2) return "the room is split";
  if (range >= 1) return "some disagreement";
  if (range > 0) return "broad agreement";
  return "unanimous";
}

export function ScoreBand({ ratings }: { ratings: number[] }) {
  const count = ratings.length;
  const average = count > 0 ? ratings.reduce((s, r) => s + r, 0) / count : null;
  const stars = average != null ? toStarScale(average) : null;
  const low = count > 0 ? toStarScale(Math.min(...ratings)) : null;
  const high = count > 0 ? toStarScale(Math.max(...ratings)) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-6">
      {stars != null ? (
        <ScoreMark value={stars} tone="fandom" label="fandom score" size={104} />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-dashed border-line font-mono text-[10px] uppercase tracking-widest text-muted">
          unrated
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          {count === 0 ? "unrated" : `${count} review${count === 1 ? "" : "s"}`}
        </span>

        {count === 0 ? (
          <p className="text-sm text-muted">Nobody here has written about this film yet.</p>
        ) : count === 1 ? (
          <p className="text-sm text-muted">
            One review so far — the second is where the argument starts.
          </p>
        ) : (
          <p className="text-sm">
            <span className="font-mono text-accent">
              ★ {low!.toFixed(1)} – {high!.toFixed(1)}
            </span>{" "}
            <span className="text-muted">across {count} writers · {spread(low!, high!)}</span>
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
