import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

// Behind a login or a redirect, so it is kept out of the index — `follow`
// stays on so the public pages it links to are still discovered.
export const metadata: Metadata = pageMetadata({
  path: "/register",
  title: "Join",
  description: "Create a CinePixo account and publish your first review.",
  noIndex: true,
});

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  return (
    <div className="py-12">
      <AuthForm mode="register" />
    </div>
  );
}
