// Render PNG icons from public/favicon.svg.
// Run with: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const svgPath = resolve('public/favicon.svg');
const svg = readFileSync(svgPath);

const targets = [
  { out: 'public/apple-touch-icon.png', size: 180 },
  { out: 'public/icon-192.png', size: 192 },
  { out: 'public/icon-512.png', size: 512 },
];

for (const { out, size } of targets) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(out);
  console.log(`wrote ${out} (${size}x${size})`);
}
