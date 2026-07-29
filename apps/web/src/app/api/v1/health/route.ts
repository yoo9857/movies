import { prisma } from "@cinepixo/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness plus a real database round trip, for uptime checks and for
 * diagnosing an incident without opening a shell.
 *
 * Deliberately says nothing about *which* database or where it lives.
 */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json(
      { status: "ok", database: "up", latencyMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[health] database check failed:", err);
    return NextResponse.json(
      { status: "degraded", database: "down", latencyMs: Date.now() - started },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } },
    );
  }
}
