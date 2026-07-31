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
//
// The padding is rounded *first* and the inner box derived from it. Rounding the
// inner box first and halving the remainder shipped icons one pixel too large —
// 257×257 for `icon.png`, 193×193 for the file the manifest declares as
// 192×192, 1025 for the logo. A PWA audit reads that as a size mismatch, and an
// odd-sided icon has no clean 16px downscale, which is the size a browser tab
// actually paints.
function fit(buf, size, padRatio, background) {
  const pad = Math.round(size * padRatio);
  const inner = size - pad * 2;
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

/**
 * A multi-size .ico from PNG frames.
 *
 * Written by hand because sharp has no .ico encoder and the format needs no
 * library: a 6-byte header, one 16-byte directory entry per frame, then the
 * frames themselves. PNG-compressed frames inside an ICO are understood by
 * every browser still in service.
 */
function ico(frames) {
  const HEADER = 6;
  const ENTRY = 16;
  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(frames.length, 4);

  let offset = HEADER + ENTRY * frames.length;
  const entries = frames.map(({ size, data }) => {
    const e = Buffer.alloc(ENTRY);
    // 0 means 256 in this field; nothing here is larger than that.
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette size — 0 for "not a palette image index"
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...frames.map((f) => f.data)]);
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
  // favicon.ico — the one icon every browser and Google's favicon crawler ask
  // for by path, and the one that was missing from the repository: production
  // had a 256×256 single-frame file left behind by an old deploy, which any
  // fresh checkout would simply not have. Four frames, because a tab paints at
  // 16 and Google's own guidance asks for a square multiple of 48.
  //
  // Transparent, like icon.png. The first cut sat the mark on an ink tile for
  // contrast on light tab strips, and everywhere a light surface showed the
  // icon — Google results above all — the tile read as a black box stapled to
  // the logo (2026-07-31, owner's call). The gold silhouette carries enough on
  // its own; only the surfaces that *require* an opaque ground (Apple touch,
  // maskable) keep the ink plate, because there the OS pins the shape.
  const icoFrames = [];
  for (const size of [16, 32, 48, 64]) {
    icoFrames.push({ size, data: await fit(mark, size, 0.06) });
  }
  out.push([path.join(APP, "favicon.ico"), ico(icoFrames)]);

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
