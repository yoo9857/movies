import Link from "next/link";
import { PostForm } from "@/components/admin/PostForm";

export const dynamic = "force-dynamic";

export default function NewPostPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Write a post</h1>
        <Link href="/admin/blog" className="text-sm text-muted hover:text-foreground">
          ← All posts
        </Link>
      </div>
      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        Not a review: a review argues about one film and carries a score, and there is no score
        field here on purpose. Pick the shelf first — it decides whether the piece has to cite
        anything, and Off Camera and The Argument both do.
      </p>
      <PostForm />
    </div>
  );
}
