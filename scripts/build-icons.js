/** Genera PNG e ICO a partir del SVG del logo (O con revólver). */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = resolve(root, 'assets/icons/logo.svg');
const outDir = resolve(root, 'assets/icons');
const publicDir = resolve(root, 'public');
await mkdir(outDir, { recursive: true });
await mkdir(publicDir, { recursive: true });

const svg = await readFile(svgPath);
const sizes = [512, 256, 128, 64, 48, 32, 16];
const pngs = new Map();

for (const size of sizes) {
  const buf = await sharp(svg, { density: 512 }).resize(size, size, { fit: 'contain' }).png().toBuffer();
  pngs.set(size, buf);
  await writeFile(resolve(outDir, `icon-${size}.png`), buf);
}

await writeFile(resolve(outDir, 'icon.png'), pngs.get(512));
await copyFile(resolve(outDir, 'icon.png'), resolve(publicDir, 'icon.png'));

// ICO con entradas PNG (Vista+).
const entries = [16, 32, 48, 64, 128, 256].map((s) => ({ size: s, data: pngs.get(s) }));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
const directory = Buffer.alloc(16 * entries.length);
let offset = header.length + directory.length;
entries.forEach((entry, i) => {
  const base = i * 16;
  directory[base] = entry.size === 256 ? 0 : entry.size;
  directory[base + 1] = entry.size === 256 ? 0 : entry.size;
  directory[base + 2] = 0;
  directory[base + 3] = 0;
  directory.writeUInt16LE(1, base + 4);
  directory.writeUInt16LE(32, base + 6);
  directory.writeUInt32LE(entry.data.length, base + 8);
  directory.writeUInt32LE(offset, base + 12);
  offset += entry.data.length;
});
await writeFile(resolve(outDir, 'icon.ico'), Buffer.concat([header, directory, ...entries.map((e) => e.data)]));

console.log('Iconos generados en assets/icons y public/icon.png');
