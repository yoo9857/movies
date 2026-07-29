// Turns the source logo (dark mark on a white plate) into the full icon set.
//
// The logo is a knockout design: a solid bubble with the type punched out of it.
// So we read darkness as the alpha channel and paint the opaque part in brand
// gold — the punched-out type then shows whatever sits behind it, which is how
// the mark was drawn to work. Nothing is redrawn or restyled.
//
//   node scripts/build-brand-assets.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "cinepixo.png");
const APP = path.join(ROOT, "apps/web/src/app");
const PUB = path.join(ROOT, "apps/web/public");

const GOLD = { r: 0xe8, g: 0xb3, b: 0x4b };
const INK = { r: 0x0b, g: 0x0b, b: 0x0f }; // brand background

// Dark pixels → opaque, light plate → transparent.
async function goldTransparent() {
  const trimmed = await sharp(SRC).trim({ threshold: 12 }).toBuffer();
  const { width, height } = await sharp(trimmed).metadata();

  const alpha = await sharp(trimmed).greyscale().negate().raw().toBuffer();
  const plate = await sharp({
    create: { width, height, channels: 3, background: GOLD },
  })
    .raw()
    .toBuffer();

  return sharp(plate, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

// Square canvas with breathing room, so the mark is never clipped by a
// circular OS mask.
function fit(buf, size, padRatio, background) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const pad = Math.round((size - inner) / 2);
  return sharp(buf)
    .resize(inner, inner, { fit: "contain", background: { ...GOLD, alpha: 0 } })
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    })
    // palette + quantisation: a two-tone mark needs nowhere near 24-bit colour
    .png({ compressionLevel: 9, palette: true, colours: 64, effort: 10 })
    .toBuffer();
}

async function main() {
  await mkdir(PUB, { recursive: true });
  const mark = await goldTransparent();
  await writeFile(path.join(PUB, "logo.png"), await fit(mark, 1024, 0.02));

  const out = [
    // Next.js file conventions — picked up automatically as <link rel>.
    // 256 is plenty: browsers only ever paint this at 16–64 px.
    [path.join(APP, "icon.png"), await fit(mark, 256, 0.06)],
    // Apple flattens transparency, so give it the brand ground explicitly
    [path.join(APP, "apple-icon.png"), await fit(mark, 180, 0.12, { ...INK, alpha: 1 })],
    // PWA / Android
    [path.join(PUB, "icon-192.png"), await fit(mark, 192, 0.08)],
    [path.join(PUB, "icon-512.png"), await fit(mark, 512, 0.08)],
    // maskable needs 20% safe padding on the brand ground
    [path.join(PUB, "icon-maskable-512.png"), await fit(mark, 512, 0.2, { ...INK, alpha: 1 })],
  ];
  for (const [file, buf] of out) await writeFile(file, buf);

  // Social card: mark on the brand ground, left of centre so the title text
  // that platforms overlay on the right never collides with it.
  const card = await sharp({
    create: { width: 1200, height: 630, channels: 4, background: { ...INK, alpha: 1 } },
  })
    .composite([{ input: await fit(mark, 360, 0.02), top: 135, left: 120 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(APP, "opengraph-image.png"), card);
  out.push([path.join(APP, "opengraph-image.png"), card]);

  for (const [file, buf] of out) {
    console.log(`${(buf.length / 1024).toFixed(1).padStart(7)} KB  ${path.relative(ROOT, file)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
