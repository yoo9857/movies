// GET /indexnow-key.txt — the file that proves we own this host.
//
// IndexNow will not accept a submission until it has fetched this and found
// the same key the POST carried. Serving it from a route rather than
// `public/` keeps the value in the environment, where the rest of our secrets
// live — though it is not really a secret: anyone can read it, and all it
// authorises is "tell search engines these URLs changed", which is a thing
// they would do anyway on their own schedule.
//
// 404 when unset, which is also the honest answer: without a key there is no
// ownership to prove.
export const dynamic = "force-dynamic";

export function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return new Response("Not found", { status: 404 });

  return new Response(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // The engines re-read this on every submission; a stale cache here would
      // make a rotated key look wrong.
      "Cache-Control": "no-store",
    },
  });
}
