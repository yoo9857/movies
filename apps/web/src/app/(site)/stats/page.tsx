import { prisma } from "@cinepixo/db";
import { toStarScale } from "@cinepixo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { RatingHistogram } from "@/components/RatingHistogram";
import {
  breadcrumbNode,
  type Crumb,
  datasetNode,
  graph,
  pageMetadata,
  webPageNode,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "How this community rates: the distribution of every published rating, averages by genre, and twelve months of publishing activity.";

export const metadata: Metadata = pageMetadata({
  path: "/stats",
  title: "Fandom stats",
  description: DESCRIPTION,
  keywords: ["film rating statistics", "genre averages", "rating distribution"],
});

const TRAIL: Crumb[] = [{ name: "Stats" }];

const MIN_SAMPLE = 3; // below this, aggregates are shown as "low sample"

export default async function StatsPage() {
  const [reviews, memberCount] = await Promise.all([
    prisma.review.findMany({
      where: { status: "PUBLISHED" },
      select: {
        rating: true,
        publishedAt: true,
        movie: { select: { id: true, slug: true, title: true, genres: true } },
      },
    }),
    prisma.user.count(),
  ]);

  const ratings = reviews.map((r) => r.rating);
  const avg = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;

  // ── Genre averages ──
  const genreMap = new Map<string, number[]>();
  for (const r of reviews) {
    for (const g of r.movie.genres) {
      genreMap.set(g, [...(genreMap.get(g) ?? []), r.rating]);
    }
  }
  const genreRows = Array.from(genreMap, ([genre, rs]) => ({
    genre,
    n: rs.length,
    avg: rs.reduce((s, x) => s + x, 0) / rs.length,
  })).sort((a, b) => b.avg - a.avg);

  // ── Monthly activity (last 12 months) ──
  const now = new Date();
  const months: { label: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push({
      label: d.toLocaleDateString("en-US", { month: "short" }),
      count: reviews.filter(
        (r) => r.publishedAt && r.publishedAt >= d && r.publishedAt < next,
      ).length,
    });
  }
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  // ── Contested films: where the writers here disagree with each other ──
  //
  // This replaced a chart of fandom-average minus TMDB's public score. That one
  // measured us against a crowd; this one measures the criticism against itself,
  // which is the more interesting number on a site about criticism — and it needs
  // no outside data to be true.
  const perMovie = new Map<string, { slug: string; title: string; ratings: number[] }>();
  for (const r of reviews) {
    const cur =
      perMovie.get(r.movie.id) ?? { slug: r.movie.slug, title: r.movie.title, ratings: [] };
    cur.ratings.push(r.rating);
    perMovie.set(r.movie.id, cur);
  }

  // A spread needs at least two opinions to exist.
  const contested = Array.from(perMovie.entries())
    .filter(([, m]) => m.ratings.length >= 2)
    .map(([id, m]) => {
      const low = toStarScale(Math.min(...m.ratings));
      const high = toStarScale(Math.max(...m.ratings));
      return {
        id,
        slug: m.slug,
        title: m.title,
        n: m.ratings.length,
        low,
        high,
        average: toStarScale(m.ratings.reduce((s, x) => s + x, 0) / m.ratings.length),
        spread: Math.round((high - low) * 100) / 100,
      };
    })
    .sort((a, b) => b.spread - a.spread || b.n - a.n)
    .slice(0, 7);

  const mostReviewed = [...perMovie.entries()].sort(
    (a, b) => b[1].ratings.length - a[1].ratings.length,
  )[0];

  // Declared as a Dataset, not decoration: these are published aggregates with
  // stated methods, and saying so is what makes them citable rather than merely
  // crawlable. Only measures this page actually renders are listed.
  const jsonLd = graph(
    webPageNode({
      path: "/stats",
      name: "Fandom stats",
      description: DESCRIPTION,
      hasBreadcrumb: true,
      dateModified: reviews.reduce<Date | null>(
        (latest, r) =>
          r.publishedAt && (!latest || r.publishedAt > latest) ? r.publishedAt : latest,
        null,
      ),
    }),
    breadcrumbNode("/stats", TRAIL),
    datasetNode({
      path: "/stats",
      name: "CinePixo rating statistics",
      description: DESCRIPTION,
      variables: [
        "Average rating across all published reviews",
        "Distribution of ratings on the 0–10 half-point scale",
        "Average rating by genre",
        "Reviews published per month over the last twelve months",
        "Most-reviewed film",
        "Rating spread per film — lowest to highest star rating received",
      ],
    }),
  );

  return (
    <div className="space-y-14">
      <JsonLd data={jsonLd} />
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Fandom stats</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">How this fandom watches</h1>
      </header>

      {/* Headline band — typographic, hairlines */}
      <section className="grid grid-cols-2 border-y border-line sm:grid-cols-4">
        {[
          { k: "Published reviews", v: String(reviews.length) },
          { k: "Fandom average", v: avg != null ? `★ ${toStarScale(avg).toFixed(2)}` : "—" },
          {
            k: "Most reviewed",
            v: mostReviewed ? mostReviewed[1].title : "—",
            small: true,
          },
          { k: "Members", v: String(memberCount) },
        ].map((s, i) => (
          <div
            key={s.k}
            className={`py-6 pr-6 ${i > 0 ? "border-l border-line pl-6" : ""} ${i >= 2 ? "border-t sm:border-t-0" : ""}`}
          >
            <p
              className={`font-bold tracking-tight text-accent ${s.small ? "truncate text-lg leading-8" : "text-3xl"} tabular-nums`}
            >
              {s.v}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {s.k}
            </p>
          </div>
        ))}
      </section>

      {reviews.length === 0 ? (
        <p className="text-muted">
          Stats appear once reviews are published.{" "}
          <Link href="/write" className="text-accent hover:opacity-80">
            Write the first →
          </Link>
        </p>
      ) : (
        <>
          {/* Genre averages + overall distribution — 2:1 */}
          <div className="grid gap-12 sm:grid-cols-[2fr_1fr]">
            <section aria-label="Average rating by genre">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                Average ★ by genre
              </h2>
              <div className="mt-4 space-y-2.5">
                {genreRows.map((g) => {
                  const low = g.n < MIN_SAMPLE;
                  return (
                    <div
                      key={g.genre}
                      className="grid grid-cols-[7rem_1fr_6.5rem] items-center gap-3 text-sm"
                    >
                      <span className="truncate text-muted">{g.genre}</span>
                      <div className="h-3.5 overflow-hidden rounded-r bg-surface-raised">
                        <div
                          className="h-full rounded-r"
                          style={{
                            width: `${(toStarScale(g.avg) / 5) * 100}%`,
                            background: low ? "var(--border)" : "var(--chart-fandom)",
                          }}
                        />
                      </div>
                      <span className="text-right font-mono text-xs tabular-nums">
                        {low ? (
                          <span className="text-muted">★ {toStarScale(g.avg).toFixed(1)} · n={g.n}</span>
                        ) : (
                          <>
                            <span className="text-accent">★ {toStarScale(g.avg).toFixed(1)}</span>
                            <span className="text-muted"> · {g.n}</span>
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 font-mono text-[10px] text-muted">
                gray = fewer than {MIN_SAMPLE} reviews (low sample)
              </p>
            </section>

            <section aria-label="Overall rating distribution">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                All ratings
              </h2>
              <RatingHistogram ratings={ratings} height={110} className="mt-4" />
            </section>
          </div>

          {/* Monthly activity */}
          <section aria-label="Reviews per month">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Reviews per month · last 12
            </h2>
            <div className="mt-4 flex items-end gap-1.5" style={{ height: 110 }}>
              {months.map((m, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5 self-stretch justify-end">
                  {m.count > 0 && i === months.length - 1 && (
                    <span className="font-mono text-[11px] text-foreground">{m.count}</span>
                  )}
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${Math.max(3, (m.count / maxMonth) * 75)}%`,
                      background: i === months.length - 1 ? "var(--chart-fandom)" : "var(--surface-raised)",
                      border: m.count === 0 ? "1px dashed var(--border)" : "none",
                    }}
                    role="img"
                    aria-label={`${m.label}: ${m.count} reviews`}
                  />
                  <span className="font-mono text-[9px] uppercase text-muted">{m.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Contested films — the signature chart. Each bar spans the lowest to
              the highest star rating a film received here, with the average
              marked, on a fixed 0–5 track so the bars are comparable. */}
          {contested.length > 0 && (
            <section aria-label="Films the writers disagree about">
              <div className="flex items-baseline justify-between">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  Where the writers disagree
                </h2>
                <span className="font-mono text-[10px] text-muted">
                  lowest ★ to highest ★, average marked
                </span>
              </div>
              <div className="mt-5 space-y-2.5">
                {contested.map((d) => (
                  <Link
                    key={d.id}
                    href={`/movies/${d.slug}`}
                    className="group grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-3 text-sm"
                  >
                    <span className="truncate text-muted group-hover:text-foreground transition-colors">
                      {d.title}
                      {d.n < MIN_SAMPLE && <span className="font-mono text-[10px]"> n={d.n}</span>}
                    </span>
                    <div className="relative h-4">
                      {/* quarter gridlines at 1★ intervals */}
                      {[1, 2, 3, 4].map((tick) => (
                        <div
                          key={tick}
                          className="absolute inset-y-0 w-px bg-line/60"
                          style={{ left: `${(tick / 5) * 100}%` }}
                        />
                      ))}
                      <div
                        className="absolute inset-y-0 rounded"
                        style={{
                          left: `${(d.low / 5) * 100}%`,
                          width: `${Math.max(1.5, ((d.high - d.low) / 5) * 100)}%`,
                          background: "var(--chart-fandom)",
                          opacity: 0.45,
                        }}
                      />
                      <div
                        className="absolute inset-y-0 w-0.5 rounded"
                        style={{
                          left: `${(d.average / 5) * 100}%`,
                          background: "var(--chart-fandom)",
                        }}
                        role="img"
                        aria-label={`${d.title}: ${d.low.toFixed(1)} to ${d.high.toFixed(1)} stars, average ${d.average.toFixed(1)}`}
                      />
                    </div>
                    <span
                      className="text-right font-mono text-xs tabular-nums"
                      style={{ color: "var(--chart-fandom)" }}
                    >
                      ±{(d.spread / 2).toFixed(2)}
                    </span>
                  </Link>
                ))}
              </div>
              <p className="mt-4 font-mono text-[10px] text-muted">
                A wide bar is an argument worth reading both sides of. The number is half the
                spread — how far a typical review sits from the middle.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
