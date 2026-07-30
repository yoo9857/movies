import { handle, json, requireSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { processImage, readUpload } from "@/lib/media/image";
import { buildKey, putPublicObject } from "@/lib/media/storage";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Upload an image for a review body.
 *
 * The editor inserts the returned URL as `![alt](url)` markdown, so the image
 * belongs to the *text*, not to a database row — a draft that is never saved
 * simply leaves an unreferenced object behind, which costs kilobytes and no
 * correctness. The same hardened pipeline as avatars applies: the buffer is
 * probed rather than trusted, EXIF (and its GPS) is stripped by re-encoding,
 * and decompression bombs are bounded before any decode.
 *
 * Keys are minted per upload and never reused, so everything downstream is
 * served immutable.
 */
export const POST = handle(async (request: Request) => {
  requireSameOrigin(request);
  const user = await requireUser();
  // A review with a dozen images is normal; a hundred an hour is not a person
  // writing. Image work is the most expensive authenticated request, so it is
  // limited per account as well as per address.
  rateLimit(`review-image:${user.id}`, 30, 60 * 60_000);
  rateLimit(`review-image-ip:${clientIp(request)}`, 90, 60 * 60_000);

  const buf = await readUpload(request, "file");
  // Full width matches the widest the review column ever renders. Animated
  // sources (GIFs) keep their motion — processImage samples the frames.
  const image = await processImage(buf, { fullWidth: 1600 });

  const url = await putPublicObject(
    buildKey("reviews", image.ext),
    image.full.data,
    image.contentType,
  );

  return json({ url, width: image.width, height: image.height }, { status: 201 });
});
