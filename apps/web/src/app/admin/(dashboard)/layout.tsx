// Server-side auth boundary for every admin page (NOT just the proxy).
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/admin/login");
  }

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-bold">
              Cine<span className="text-accent">Pixo</span>{" "}
              <span className="text-xs font-normal text-muted">admin</span>
            </Link>
            <nav className="flex gap-4 text-sm text-muted">
              <Link href="/admin/reviews" className="hover:text-foreground">
                Reviews
              </Link>
              <Link href="/admin/movies" className="hover:text-foreground">
                Movies
              </Link>
              <Link href="/" className="hover:text-foreground">
                View site ↗
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>{user.displayName ?? user.username}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
