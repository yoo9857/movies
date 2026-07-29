import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "cinepixo_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  sub: string; // user id
  role: "ADMIN" | "MEMBER";
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // Fail closed — never run with a weak or missing secret
    throw new Error("SESSION_SECRET is missing or too short (min 32 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true, // no JS access — blocks session theft via XSS
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // CSRF mitigation layer 1 (layer 2: Origin check on mutations)
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"], // pin the algorithm — no downgrade attacks
    });
    if (typeof payload.sub !== "string") return null;
    const role = payload.role === "ADMIN" ? "ADMIN" : "MEMBER";
    return { sub: payload.sub, role };
  } catch {
    return null; // expired or tampered token → treated as logged out
  }
}

export { COOKIE_NAME as SESSION_COOKIE_NAME };
