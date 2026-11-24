// Compara dos screenshots del mismo juego (debug ON vs OFF) y cuenta px de diferencia.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function decode(path) {
  const data = readFileSync(path);
  const w = data.readUInt32BE(16), h = data.readUInt32BE(20);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[data[25]];
  const chunks = [];
  let off = 8;
  while (off < data.length) {
    const len = data.readUInt32BE(off);
    const type = data.toString('utf8', off + 4, off + 8);
    chunks.push({ type, data: data.subarray(off + 8, off + 8 + len) });
    off += 12 + len;
  }
  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data).reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0));
  const raw = inflateSync(idat);
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride).fill(0);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const row = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? row[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      switch (f) {
        case 0: row[x] = line[x]; break;
        case 1: row[x] = (line[x] + a) & 0xff; break;
        case 2: row[x] = (line[x] + b) & 0xff; break;
        case 3: row[x] = (line[x] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          row[x] = (line[x] + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 0xff;
          break;
        }
      }
    }
    prev = row;
  }
  return { w, h, ch, px };
}

const a = decode(process.argv[2]);
const b = decode(process.argv[3]);
if (a.w !== b.w || a.h !== b.h) throw new Error('sizes differ');
let diff = 0, maxDiff = 0;
for (let i = 0; i < a.px.length; i += a.ch) {
  const d = Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]);
  if (d > 6) diff++;
  if (d > maxDiff) maxDiff = d;
}
console.log(`diff px:${diff} maxDiff:${maxDiff} (total ${a.px.length / a.ch})`);
