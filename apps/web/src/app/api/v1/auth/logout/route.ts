import { handle, json, requireSameOrigin } from "@/lib/api";
import { destroySession } from "@/lib/session";

export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  await destroySession();
  return json({ ok: true });
});
