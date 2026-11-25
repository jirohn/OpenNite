// Genera public/textures/storm-hex.svg: textura repetible de hexágonos para la cúpula de la tormenta.
// Canales: R,G = inclinación aleatoria de cada cristal (0..1 => -1..1), B = marco del hexágono con bisel.
import { writeFileSync } from 'node:fs';

const COLS = 7;           // hexágonos por fila en un periodo
const ROWS = 4;           // pares de filas en un periodo
const S = 10;             // lado del hexágono (unidades SVG)
const HW = Math.sqrt(3) * S; // ancho de un hexágono (punta arriba)
const W = HW * COLS;
const H = 3 * S * ROWS;   // 2 filas = 3 lados de alto
const PX = 1024;

// Aleatorio determinista por celda envuelta (la textura es seamless).
function rand(i, j, k) {
  const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return x - Math.floor(x);
}
const f = (n) => n.toFixed(3);
function hexPath(cx, cy, s) {
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 180 * (60 * k - 90);
    d += `${k ? 'L' : 'M'}${f(cx + s * Math.cos(a))},${f(cy + s * Math.sin(a))}`;
  }
  return d + 'Z';
}

const cells = [];
const lines = [];
for (let r = -1; r <= ROWS * 2; r++) {
  for (let c = -1; c <= COLS; c++) {
    const cx = c * HW + (r & 1 ? HW / 2 : 0);
    const cy = r * 1.5 * S;
    const wi = ((c % COLS) + COLS) % COLS;
    const wj = ((r % (ROWS * 2)) + ROWS * 2) % (ROWS * 2);
    const R = Math.round(rand(wi, wj, 1) * 255);
    const G = Math.round(rand(wi, wj, 2) * 255);
    cells.push(`<path d="${hexPath(cx, cy, S + 0.6)}" fill="rgb(${R},${G},0)"/>`);
    lines.push(hexPath(cx, cy, S));
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}" viewBox="0 0 ${f(W)} ${f(H)}" preserveAspectRatio="none">
  <!-- OpenNite · cúpula de tormenta. R,G: inclinación de cada cristal. B: marco + bisel. Generado por scripts/build-storm-hex.mjs -->
  <defs>
    <filter id="bevel" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.1"/></filter>
  </defs>
  <rect width="100%" height="100%" fill="rgb(128,128,0)"/>
  <g>${cells.join('')}</g>
  <g style="mix-blend-mode:screen" fill="none" stroke-linejoin="round">
    <path d="${lines.join('')}" stroke="rgb(0,0,150)" stroke-width="3.2" filter="url(#bevel)"/>
    <path d="${lines.join('')}" stroke="rgb(0,0,255)" stroke-width="0.9"/>
  </g>
</svg>
`;
writeFileSync(new URL('../public/textures/storm-hex.svg', import.meta.url), svg);
console.log(`storm-hex.svg: periodo ${W.toFixed(2)} x ${H.toFixed(2)} (relación ${(W / H).toFixed(4)})`);
