import { prisma } from "@cinepixo/db";
import Link from "next/link";
import { ReviewCard } from "@/components/ReviewCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [reviews, criticCount] = await Promise.all([
    prisma.review.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        rating: true,
        publishedAt: true,
        author: { select: { username: true, displayName: true } },
        movie: { select: { title: true, posterPath: true, director: true } },
      },
    }),
    prisma.critic.count(),
  ]);

  return (
    <div className="space-y-12">
      <section className="pt-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          For the love of <span className="text-accent">film criticism</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted">
          CinePixo is a fandom home for people who grew up on Ebert reviews, Kermode rants and
          video essays — write reviews, rate films, and celebrate the critics who taught us how to
          watch.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/reviews"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            Read reviews
          </Link>
          <Link
            href="/critics"
            className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold transition-colors hover:border-accent-dim"
          >
            Meet the critics{criticCount > 0 ? ` (${criticCount})` : ""}
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Latest reviews</h2>
          <Link href="/reviews" className="text-sm text-muted hover:text-foreground">
            View all →
          </Link>
        </div>
        {reviews.length === 0 ? (
          <p className="text-muted">No reviews yet — the projector is warming up.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {reviews.map((r) => (
              <ReviewCard key={r.slug} review={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
