// Decodifica PNG (sin libs) y escanea por colores de debug.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const data = readFileSync('tmp/screenshot.png');
const readU32 = (off) => data.readUInt32BE(off);

const width = readU32(16);
const height = readU32(20);
const bitDepth = data[24];
const colorType = data[25];
if (bitDepth !== 8) throw new Error('solo 8-bit');
const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
if (!channels) throw new Error('colortype no soportado: ' + colorType);

const chunks = [];
let off = 8;
while (off < data.length) {
  const len = readU32(off);
  const type = data.toString('utf8', off + 4, off + 8);
  chunks.push({ type, data: data.subarray(off + 8, off + 8 + len) });
  off += 12 + len;
}
const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data).reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0));
const raw = inflateSync(idat);
const stride = width * channels;
const decoded = Buffer.alloc(height * stride);
let prev = Buffer.alloc(stride).fill(0);
for (let y = 0; y < height; y++) {
  const f = raw[y * (stride + 1)];
  const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  const row = decoded.subarray(y * stride, (y + 1) * stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= channels ? row[x - channels] : 0;
    const b = prev[x];
    const c = x >= channels ? prev[x - channels] : 0;
    switch (f) {
      case 0: row[x] = line[x]; break;
      case 1: row[x] = (line[x] + a) & 0xff; break;
      case 2: row[x] = (line[x] + b) & 0xff; break;
      case 3: row[x] = (line[x] + ((a + b) >> 1)) & 0xff; break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        row[x] = (line[x] + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 0xff;
        break;
      }
    }
  }
  prev = row;
}

const near = (idx, r, g, b, tol = 8) => {
  const d = Math.abs(decoded[idx] - r) + Math.abs(decoded[idx + 1] - g) + Math.abs(decoded[idx + 2] - b);
  return d <= tol * 3;
};
const scanColor = (r, g, b) => {
  let cnt = 0;
  const pts = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = y * stride + x * channels;
      if (near(idx, r, g, b)) {
        cnt++;
        if (pts.length < 12) pts.push(`(${x},${y})`);
      }
    }
  }
  return { count: cnt, sample: pts.join(' ') };
};

console.log('size', width, 'x', height);
console.log('axisX ff4444:', JSON.stringify(scanColor(0xff, 0x44, 0x44)));
console.log('axisY 3ccb3c:', JSON.stringify(scanColor(0x3c, 0xcb, 0x3c)));
console.log('axisZ 445bff:', JSON.stringify(scanColor(0x44, 0x5b, 0xff)));
console.log('markerCyan 00ffff:', JSON.stringify(scanColor(0, 0xff, 0xff)));
console.log('structOrange ffaa00:', JSON.stringify(scanColor(0xff, 0xaa, 0x00)));
console.log('debugRedCollider ff3333:', JSON.stringify(scanColor(0xff, 0x33, 0x33)));
