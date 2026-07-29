// Conclusion first. The score wears the house bubble; the verdict sentence
// sits beside it so a reader gets the answer before the argument.
import { toStarScale } from "@cinepixo/shared";
import { ScoreMark } from "../ScoreMark";

export function VerdictBlock({
  rating,
  verdict,
  spoilers,
}: {
  rating: number;
  verdict: string | null;
  spoilers: "NONE" | "MILD" | "FULL";
}) {
  const stars = toStarScale(rating);

  return (
    <section
      className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl border border-line bg-surface px-5 py-5 sm:px-6"
      aria-label="Verdict"
    >
      <ScoreMark value={stars} tone="fandom" label="verdict" size={92} />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          The verdict
        </p>
        {verdict ? (
          <p className="mt-1.5 text-balance text-lg font-semibold leading-snug sm:text-xl">
            {verdict}
          </p>
        ) : (
          <p className="mt-1.5 text-lg font-semibold leading-snug text-muted">
            {stars >= 4.5
              ? "One for the shelf."
              : stars >= 3.5
                ? "Worth your evening."
                : stars >= 2.5
                  ? "Mixed, but it has its moments."
                  : "Hard to recommend."}
          </p>
        )}
        {spoilers !== "NONE" && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-chart-alt/40 bg-chart-alt/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-chart-alt">
            {spoilers === "FULL" ? "Full spoilers ahead" : "Minor spoilers ahead"}
          </p>
        )}
      </div>
    </section>
  );
}
