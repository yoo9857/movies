// Data Access Layer auth — the real security boundary.
// Per CVE-2025-29927's lesson, proxy/middleware is convenience only:
// every protected route handler and page calls these functions directly.
import { prisma, type User } from "@cinepixo/db";
import { ApiError } from "./api";
import { readSession } from "./session";

export type SafeUser = Pick<
  User,
  "id" | "email" | "username" | "displayName" | "bio" | "role" | "avatarUrl"
>;

const safeSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  bio: true,
  role: true,
  avatarUrl: true,
} as const;

// Loads the user fresh from the DB so revoked/demoted accounts lose access
// immediately, even with a still-valid JWT.
export async function getCurrentUser(): Promise<SafeUser | null> {
  const session = await readSession();
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.sub }, select: safeSelect });
}

export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Authentication required");
  return user;
}

export async function requireAdmin(): Promise<SafeUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "Admin access required");
  return user;
}

/**
 * Is the viewer the desk? The same DAL check as `requireAdmin`, asked as a
 * question rather than made as a demand — for a page that renders *differently*
 * for an admin instead of refusing the request, which is what a draft blog post
 * preview needs.
 *
 * Deliberately not a shortcut around `requireAdmin`: anything that authorises an
 * action still calls that, so the throwing path remains the only way to permit
 * one. This decides what to render, and nothing else.
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "ADMIN";
}
