import { prisma } from "@cinepixo/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostForm } from "@/components/admin/PostForm";

export const dynamic = "force-dynamic";

export default async function EditPostPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      // Resolved here so the pickers can name what is already linked without a
      // request — the same reason the film picker takes an `initial` list.
      people: {
        orderBy: { sort: "asc" },
        select: { person: { select: { id: true, name: true, occupations: true } } },
      },
      movies: {
        orderBy: { sort: "asc" },
        select: { movie: { select: { id: true, title: true, releaseDate: true } } },
      },
    },
  });
  if (!post) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Edit post</h1>
        <div className="flex gap-4 text-sm text-muted">
          <Link href={`/blog/${post.slug}`} className="hover:text-foreground">
            {post.status === "PUBLISHED" ? "View ↗" : "Preview ↗"}
          </Link>
          <Link href="/admin/blog" className="hover:text-foreground">
            ← All posts
          </Link>
        </div>
      </div>

      <PostForm
        postId={post.id}
        initialStatus={post.status}
        initial={{
          slug: post.slug,
          title: post.title,
          dek: post.dek ?? "",
          content: post.content,
          category: post.category,
          tags: post.tags,
          sources: post.sources,
          personIds: post.people.map((p) => p.person.id),
          movieIds: post.movies.map((m) => m.movie.id),
          image: post.image ?? "",
          imageAlt: post.imageAlt ?? "",
          imageCredit: post.imageCredit ?? "",
          imageLicense: post.imageLicense ?? "",
          imageLicenseUrl: post.imageLicenseUrl ?? "",
          imageSourceUrl: post.imageSourceUrl ?? "",
        }}
        knownPeople={post.people.map((p) => ({
          id: p.person.id,
          label: p.person.name,
          hint: p.person.occupations[0] ?? null,
        }))}
        knownFilms={post.movies.map((m) => ({
          id: m.movie.id,
          label: m.movie.title,
          hint: m.movie.releaseDate ? String(m.movie.releaseDate.getUTCFullYear()) : null,
        }))}
      />
    </div>
  );
}
