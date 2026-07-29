import { prisma } from "@cinepixo/db";
import { hashPassword } from "@cinepixo/db/password";
import { registerSchema } from "@cinepixo/shared";
import { ApiError, handle, json, parseJson, requireSameOrigin } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";

export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);

  // Registration abuse guard: 5 signups per IP per hour
  rateLimit(`register:${clientIp(request)}`, 5, 60 * 60_000);

  const input = registerSchema.parse(await parseJson(request));
  const email = input.email.toLowerCase();

  const [emailTaken, usernameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { username: input.username } }),
  ]);
  if (emailTaken) throw new ApiError(409, "An account with this email already exists");
  if (usernameTaken) throw new ApiError(409, "This username is taken");

  const user = await prisma.user.create({
    data: {
      email,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName ?? input.username,
      role: "MEMBER", // role is never client-controlled
    },
  });

  await createSession({ sub: user.id, role: "MEMBER" });

  return json(
    {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    },
    { status: 201 },
  );
});
