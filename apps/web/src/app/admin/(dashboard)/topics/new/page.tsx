import Link from "next/link";
import { TopicForm } from "@/components/admin/TopicForm";

export const dynamic = "force-dynamic";

export default function NewTopicPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Add topic</h1>
        <Link href="/admin/topics" className="text-sm text-muted hover:text-foreground">
          ← All topics
        </Link>
      </div>
      <p className="max-w-2xl text-sm text-muted">
        A theme is what a film is about; a motif is what recurs on screen. If an axis seems to be
        both, it is usually two axes that have not been separated yet. Films are assigned once the
        topic exists.
      </p>
      <TopicForm />
    </div>
  );
}
