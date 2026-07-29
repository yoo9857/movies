import { prisma } from "@cinepixo/db";
import { verifyPassword } from "@cinepixo/db/password";
import { loginSchema } from "@cinepixo/shared";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";

export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);

  // Brute-force protection: per-IP and per-account windows
  const ip = clientIp(request);
  rateLimit(`login:ip:${ip}`, 10, 60_000);

  const body = loginSchema.parse(await parseJson(request));
  rateLimit(`login:email:${body.email.toLowerCase()}`, 5, 60_000);

  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
  });

  // Same error for unknown email vs wrong password — no account enumeration
  const invalid = new ApiError(401, "Invalid email or password");
  if (!user) {
    // Burn comparable time so response timing doesn't reveal account existence
    await verifyPassword(body.password, "scrypt$65536$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    throw invalid;
  }
  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) throw invalid;

  await createSession({ sub: user.id, role: user.role === "ADMIN" ? "ADMIN" : "MEMBER" });

  return json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
  });
});
