/**
 * Telling search engines a URL changed, instead of waiting to be asked.
 *
 * A sitemap is a standing invitation; a crawler still arrives when it feels
 * like it, which for a young site is days. IndexNow inverts that: one POST
 * naming the URLs, and Bing, Yandex, Seznam and Naver fetch them promptly.
 * The protocol is shared, so a single submission reaches all of them.
 *
 * **Google is not a participant.** There is no equivalent for it: the Indexing
 * API is restricted to job postings and livestreams, and the sitemap ping
 * endpoint was retired in 2023. For Google the levers are the sitemap in
 * robots.txt (we have it), internal links from pages it already knows (a
 * post's subjects link to it, and those pages are indexed), and a person
 * pressing "Request indexing" in Search Console. Saying that plainly is more
 * use than pretending this covers it.
 *
 * Failure here is never worth failing a publish over: the piece is live either
 * way, and a sitemap still carries it.
 */
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Where the key is served, proving we own the host. See the route of the same name. */
export const KEY_PATH = "/indexnow-key.txt";

export interface SubmitResult {
  ok: boolean;
  /** Why it did not run, or what the engines answered. */
  detail: string;
}

/**
 * Submit up to 10,000 URLs. They must all be on `host`, which the protocol
 * checks against the key file before accepting anything.
 */
export async function submitUrls(urls: string[], siteUrl: string): Promise<SubmitResult> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return { ok: false, detail: "INDEXNOW_KEY is not set — nothing submitted" };
  if (urls.length === 0) return { ok: false, detail: "no URLs to submit" };

  let host: string;
  try {
    host = new URL(siteUrl).host;
  } catch {
    return { ok: false, detail: `not a site URL: ${siteUrl}` };
  }

  // The engines reject the whole batch if one URL is on another host, so the
  // mistake is caught here where it can name itself.
  const foreign = urls.find((u) => {
    try {
      return new URL(u).host !== host;
    } catch {
      return true;
    }
  });
  if (foreign) return { ok: false, detail: `${foreign} is not on ${host}` };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: new URL(KEY_PATH, siteUrl).href,
        urlList: urls.slice(0, 10_000),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    // 200 accepted, 202 accepted but the key is still being verified. Both mean
    // the submission landed; anything else is worth printing verbatim.
    if (res.status === 200 || res.status === 202) {
      return { ok: true, detail: `${urls.length} URL(s) submitted (${res.status})` };
    }
    return { ok: false, detail: `IndexNow answered ${res.status}` };
  } catch {
    return { ok: false, detail: "could not reach IndexNow" };
  }
}
