import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

// Wraps a route handler: zod errors → 400, ApiError → its status,
// anything else → opaque 500 (no stack traces or internals leak to clients).
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ZodError) {
        return json(
          { error: "Validation failed", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
          { status: 400 },
        );
      }
      if (err instanceof ApiError) {
        return json({ error: err.message }, { status: err.status });
      }
      console.error("[api] unhandled error:", err);
      return json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

// CSRF defense layer 2 (layer 1 is SameSite=Lax): every state-changing
// request must originate from this site.
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return; // non-browser clients (native app, curl) carry no Origin
  const host = request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, "Invalid origin");
  }
  if (!host || originHost !== host) {
    throw new ApiError(403, "Cross-origin request rejected");
  }
}

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
}
