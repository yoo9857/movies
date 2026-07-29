import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AvatarUpload } from "@/components/AvatarUpload";
import { SectionHead } from "@/components/ReelDivider";
import { getCurrentUser } from "@/lib/auth";
import { pageMetadata } from "@/lib/seo";
import { usingObjectStorage } from "@/lib/media/storage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  path: "/me/settings",
  title: "Your profile",
  description: "Your CinePixo profile picture and account details.",
  noIndex: true,
});

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = user.displayName ?? user.username;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Your profile</h1>
      <p className="mt-1.5 text-sm text-muted">
        Signed in as {user.username} · {user.email}
      </p>

      <section className="mt-9">
        <SectionHead>Profile picture</SectionHead>
        <div className="mt-4">
          <AvatarUpload current={user.avatarUrl} name={name} />
        </div>
        <p className="mt-4 max-w-prose text-xs leading-relaxed text-muted">
          JPEG, PNG, WebP, AVIF or GIF, up to 20 MB. Pictures are cropped square,
          re-encoded, and stripped of camera metadata — including any GPS coordinates
          the original carried.
          {!usingObjectStorage && " Stored on this server."}
        </p>
      </section>

      <section className="mt-12">
        <SectionHead>Your writing</SectionHead>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/me/reviews"
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold transition-colors hover:border-accent-dim"
          >
            My reviews
          </Link>
          <Link
            href="/write"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
          >
            Write a review
          </Link>
        </div>
      </section>
    </div>
  );
}
