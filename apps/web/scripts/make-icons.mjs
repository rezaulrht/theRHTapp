// Draws the app icons: a brass "P" inside a brass ring on the green ground.
// No image library needed; it writes PNG files directly.
//   node apps/web/scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
const GROUND = [0x0e, 0x26, 0x20];
const BRASS = [0xc8, 0xa6, 0x62];
const SAMPLES = 4; // supersampling per axis, for smooth edges

/** Is the point (x, y), in units where the icon is 1 x 1, inside the mark? */
function inMark(x, y, scale) {
  // Work around the centre; `scale` shrinks the mark for the maskable icon's safe zone.
  const u = (x - 0.5) / scale;
  const v = (y - 0.5) / scale;

  const ring = Math.hypot(u, v);
  if (ring >= 0.385 && ring <= 0.405) return true;

  // The letter P: a stem, and a bowl made from the right half of a ring.
  const stem = u >= -0.115 && u <= -0.055 && v >= -0.215 && v <= 0.215;
  if (stem) return true;
  const bowl = Math.hypot(u + 0.055, v + 0.09);
  return u >= -0.055 && bowl >= 0.075 && bowl <= 0.125;
}

function png(size, pixel) {
  const row = size * 3 + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      raw.set([r, g, b], y * row + 1 + x * 3);
    }
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function icon(size, scale) {
  return png(size, (x, y) => {
    let hits = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        if (inMark((x + (sx + 0.5) / SAMPLES) / size, (y + (sy + 0.5) / SAMPLES) / size, scale)) hits++;
      }
    }
    const mix = hits / (SAMPLES * SAMPLES);
    return GROUND.map((ground, i) => Math.round(ground + (BRASS[i] - ground) * mix));
  });
}

mkdirSync(outDir, { recursive: true });
const files = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  // Android may crop a maskable icon to a circle; keep the mark inside the safe zone.
  ['icon-maskable-512.png', 512, 0.78],
  ['apple-touch-icon.png', 180, 0.92],
];
for (const [name, size, scale] of files) {
  writeFileSync(path.join(outDir, name), icon(size, scale));
  console.log(`wrote ${name}`);
}
