/**
 * OpenNite - Malla del terreno modular (estilo cartoon sin outline, tipo Zelda TotK).
 *
 * Construye, a partir del bloque `modular` normalizado del mapa:
 *   - superficies de tesela (hierba con degradado suave, camino de tierra, arena, losas)
 *   - empedrado de piedras sueltas sobre las teselas "cobble"
 *   - acantilados de roca facetada con labio de césped (borde "cliff")
 *   - muros de terraza de piedra con remate de piedras (borde "wall")
 *   - escaleras de piedra y rampas
 * y devuelve también los colisionadores AABB de los desniveles grandes.
 *
 * Lo usan World (juego) y, a través de World.rebuildCustomMap, el editor: la misma
 * función genera exactamente la misma geometría en ambos.
 */
import * as THREE from 'three';
import { getCartoonGradient } from './cartoon.mjs';
import { hash2, noise2 } from './utils.js';
import {
  MODULAR_DIRS,
  modularStairSteps,
  modularKey,
  modularLevelY,
  modularCellTopAt,
  modularCellCorners,
  modularCornerCut,
} from './modular-terrain.mjs';

const PALETTE = {
  grassDark: 0x4ea83b,
  grass: 0x67bf45,
  grassLight: 0x8fd556,
  grassHigh: 0xb8d95e,
  lipGrass: 0x3d9334,
  path: 0xdcc493,
  pathDark: 0xc7aa78,
  cobbleBed: 0x8f7a5b,
  cobbleStone: 0xd8d5cd,
  cobbleStone2: 0xb9b6b0,
  sand: 0xf0dfa4,
  plaza: 0xc4bfb3,
  rockTop: 0xc3c0d6,
  rockBottom: 0x7b819f,
  wallStone: 0xa7a5a2,
  wallStone2: 0x8f8d8a,
  mortar: 0x6c645a,
  capStone: 0xc9c7c2,
  stairTread: 0xb9bbc0,
  stairRiser: 0x9094a0,
};

const COLLIDE_MIN_DROP = 0.45; // = MAX_STEP_UP del jugador
const MODULAR_CORNER_SIGNS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const LIP = 0.32; // banda de césped que remata el acantilado
const ROCK_ROW = 1.5; // alto aproximado de cada fila de facetas

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Hash determinista de una posición mundial (las aristas compartidas coinciden). */
function hpos(x, y, z, seed) {
  return hash2(Math.round(x * 64) + Math.round(y * 64) * 7919, Math.round(z * 64), seed);
}

/** Acumulador de triángulos no indexados con color por vértice. */
class TriBuffer {
  constructor() {
    this.pos = [];
    this.col = [];
  }

  /** Triángulo con la cara frontal mirando hacia `out` (vector aproximado). */
  tri(a, b, c, ca, cb = ca, cc = ca, out = null) {
    if (out) {
      _ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      _ac.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      _n.crossVectors(_ab, _ac);
      if (_n.x * out[0] + _n.y * out[1] + _n.z * out[2] < 0) {
        const t = b; b = c; c = t;
        const tc = cb; cb = cc; cc = tc;
      }
    }
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }

  /** Cuadrilátero a-b-c-d (en orden perimetral). */
  quad(a, b, c, d, ca, out, cb = ca, cc = ca, cd = ca) {
    this.tri(a, b, c, ca, cb, cc, out);
    this.tri(a, c, d, ca, cc, cd, out);
  }

  get count() {
    return this.pos.length / 9;
  }

  toGeometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

function shade(hex, f, out = new THREE.Color()) {
  out.setHex(hex);
  out.r = Math.min(1, out.r * f);
  out.g = Math.min(1, out.g * f);
  out.b = Math.min(1, out.b * f);
  return out;
}

/** Material toon compartido por todo el terreno modular (sin contorno). */
export function makeModularTerrainMaterial() {
  const mat = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    gradientMap: getCartoonGradient(),
  });
  // Normales por cara (geometría no indexada): aspecto facetado sin flatShading.
  mat.customProgramCacheKey = () => 'opennite-modular-terrain-v2';
  return mat;
}

/**
 * Construye la malla del terreno modular.
 * @param {object} mod bloque modular normalizado (normalizeModularTerrain)
 * @param {object} opts { seed, shadows, outsideHeight(x,z), blockSize }
 * @returns {{ group: THREE.Group, colliders: Array, dispose: Function, stats: object }}
 */
export function buildModularTerrainMesh(mod, opts = {}) {
  const seed = (opts.seed ?? 1) | 0;
  const T = mod.tile;
  const L = mod.level;
  const blockSize = opts.blockSize || 32;
  const buffers = new Map(); // bloque espacial -> TriBuffer (para frustum culling)
  const colliders = [];
  let maxLevel = 1;
  for (const c of mod.cells.values()) maxLevel = Math.max(maxLevel, c.level + 1);
  const yRange = Math.max(L * 2, maxLevel * L);

  const bufFor = (x, z) => {
    const k = `${Math.floor(x / blockSize)},${Math.floor(z / blockSize)}`;
    let b = buffers.get(k);
    if (!b) { b = new TriBuffer(); buffers.set(k, b); }
    return b;
  };

  const cellAt = (gx, gz) => mod.cells.get(modularKey(gx, gz)) || null;
  const outsideY = (x, z) => {
    if (mod.outside === 'sea') return mod.seaFloor;
    const h = typeof opts.outsideHeight === 'function' ? opts.outsideHeight(x, z) : null;
    return Number.isFinite(h) ? h - 0.5 : mod.baseY - 2;
  };

  // ---------------------------------------------------------------- colores
  const grassColor = (x, y, z, out) => {
    let n = noise2(x * 0.06, z * 0.06, seed + 11) * 0.65 + noise2(x * 0.19, z * 0.19, seed + 29) * 0.35;
    n = Math.max(0, Math.min(1, (n - 0.5) * 1.8 + 0.5));
    if (n < 0.5) out.setHex(PALETTE.grassDark).lerp(_c2.setHex(PALETTE.grass), n / 0.5);
    else out.setHex(PALETTE.grass).lerp(_c2.setHex(PALETTE.grassLight), (n - 0.5) / 0.5);
    // Las terrazas altas aclaran hacia un verde amarillento (degradado TotK).
    const hT = Math.max(0, Math.min(1, (y - mod.baseY) / yRange));
    out.lerp(_c2.setHex(PALETTE.grassHigh), hT * 0.38);
    return out;
  };
  const surfaceColor = (surface, x, y, z, out) => {
    const v = 0.94 + noise2(x * 0.3, z * 0.3, seed + 5) * 0.12;
    switch (surface) {
      case 'path': return shade(PALETTE.path, 1, out).lerp(_c2.setHex(PALETTE.pathDark), noise2(x * 0.18, z * 0.18, seed + 41) * 0.8);
      case 'cobble': return shade(PALETTE.cobbleBed, v, out);
      case 'sand': return shade(PALETTE.sand, v, out);
      case 'stone': return shade(PALETTE.plaza, v, out);
      default: return grassColor(x, y, z, out);
    }
  };
  const rockColor = (y, h, out) => {
    const t = Math.max(0, Math.min(1, (y - mod.baseY + L) / (yRange + L)));
    out.setHex(PALETTE.rockBottom).lerp(_c2.setHex(PALETTE.rockTop), 0.25 + t * 0.75);
    const f = 0.86 + h * 0.24;
    out.r *= f; out.g *= f; out.b *= f;
    return out;
  };

  // ------------------------------------------------------- superficie de tesela
  const SUB = 4;
  const UP = [0, 1, 0];
  /** Contorno en planta de una tesela con esquinas redondeadas (orden perimetral). */
  const roundedOutline = (c, corners) => {
    const cx = c.gx * T, cz = c.gz * T;
    const out = [];
    const sidePoint = (d, t) => {
      const [dx, dz] = MODULAR_DIRS[d];
      const perp = [-dz, dx];
      return [cx + dx * T / 2 + perp[0] * (t - 0.5) * T, cz + dz * T / 2 + perp[1] * (t - 0.5) * T];
    };
    for (let i = 0; i < 4; i++) {
      const k = corners[i];
      if (!k) {
        out.push({ x: cx + MODULAR_CORNER_SIGNS[i][0] * T / 2, z: cz + MODULAR_CORNER_SIGNS[i][1] * T / 2, corner: i });
        continue;
      }
      for (const p of arcPoints(c, k, i)) out.push({ ...p, corner: i, arc: true });
    }
    return out;
  };

  /** Puntos del arco de la esquina i: desde el final del lado anterior al inicio del lado i. */
  const arcPoints = (c, k, i) => {
    const prev = (i + 3) % 4;
    const [pdx, pdz] = MODULAR_DIRS[prev];
    const pperp = [-pdz, pdx];
    const [ndx, ndz] = MODULAR_DIRS[i];
    const nperp = [-ndz, ndx];
    const cx = c.gx * T, cz = c.gz * T;
    const t1 = 1 - k.R / T, t0 = k.R / T;
    const sx = cx + pdx * T / 2 + pperp[0] * (t1 - 0.5) * T, sz = cz + pdz * T / 2 + pperp[1] * (t1 - 0.5) * T;
    const ex = cx + ndx * T / 2 + nperp[0] * (t0 - 0.5) * T, ez = cz + ndz * T / 2 + nperp[1] * (t0 - 0.5) * T;
    let a0 = Math.atan2(sz - k.cz, sx - k.cx);
    let a1 = Math.atan2(ez - k.cz, ex - k.cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const n = Math.max(3, Math.ceil((k.R * Math.PI / 2) / 0.45));
    const pts = [];
    for (let j = 0; j <= n; j++) {
      const a = a0 + da * (j / n);
      const nx = Math.cos(a), nz = Math.sin(a);
      pts.push({ x: k.cx + nx * k.R, z: k.cz + nz * k.R, nx, nz });
    }
    return pts;
  };

  const buildTop = (c) => {
    if (c.shape === 'stairs') return;
    const cx = c.gx * T, cz = c.gz * T;
    const buf = bufFor(cx, cz);
    const corners = c.round > 0 ? modularCellCorners(mod, c) : null;
    if (corners && corners.some(Boolean)) {
      // Abanico desde el centro hasta el contorno redondeado.
      const y = modularLevelY(mod, c.level);
      const outline = roundedOutline(c, corners);
      const center = [cx, y, cz];
      const cc = surfaceColor(c.surface, cx, y, cz, new THREE.Color());
      for (let i = 0; i < outline.length; i++) {
        const p = outline[i], q = outline[(i + 1) % outline.length];
        const cp = surfaceColor(c.surface, p.x, y, p.z, new THREE.Color());
        const cq = surfaceColor(c.surface, q.x, y, q.z, new THREE.Color());
        buf.tri(center, [p.x, y, p.z], [q.x, y, q.z], cc, cp, cq, UP);
      }
      // Suelo del hueco que deja cada arco, a la altura de las vecinas.
      for (let i = 0; i < 4; i++) {
        const k = corners[i];
        if (!k || k.outside) continue;
        const arc = arcPoints(c, k, i);
        const corner = [k.cornerX, k.y, k.cornerZ];
        const fc = surfaceColor(k.surface, k.cornerX, k.y, k.cornerZ, new THREE.Color());
        for (let j = 0; j < arc.length - 1; j++) {
          const a = arc[j], b = arc[j + 1];
          buf.tri(corner, [a.x, k.y, a.z], [b.x, k.y, b.z], fc, surfaceColor(k.surface, a.x, k.y, a.z, new THREE.Color()), surfaceColor(k.surface, b.x, k.y, b.z, new THREE.Color()), UP);
        }
      }
      if (c.surface === 'cobble') buildCobbles(c, buf);
      return;
    }
    const step = T / SUB;
    const vtx = [];
    const cols = [];
    for (let j = 0; j <= SUB; j++) {
      for (let i = 0; i <= SUB; i++) {
        const x = cx - T / 2 + i * step;
        const z = cz - T / 2 + j * step;
        // Muestra ligeramente hacia dentro para que la rampa no lea la tesela vecina.
        const sx = Math.min(cx + T / 2 - 1e-3, Math.max(cx - T / 2 + 1e-3, x));
        const sz = Math.min(cz + T / 2 - 1e-3, Math.max(cz - T / 2 + 1e-3, z));
        const y = modularCellTopAt(mod, c, sx, sz);
        vtx.push([x, y, z]);
        cols.push(surfaceColor(c.surface, x, y, z, new THREE.Color()));
      }
    }
    const idx = (i, j) => j * (SUB + 1) + i;
    for (let j = 0; j < SUB; j++) {
      for (let i = 0; i < SUB; i++) {
        const a = idx(i, j), b = idx(i + 1, j), d = idx(i, j + 1), e = idx(i + 1, j + 1);
        buf.tri(vtx[a], vtx[d], vtx[b], cols[a], cols[d], cols[b], UP);
        buf.tri(vtx[b], vtx[d], vtx[e], cols[b], cols[d], cols[e], UP);
      }
    }
    if (c.surface === 'cobble') buildCobbles(c, buf);
  };

  // ----------------------------------------------------------- empedrado
  const buildCobbles = (c, buf) => {
    const cx = c.gx * T, cz = c.gz * T;
    const N = 4;
    const cellStep = T / N;
    const col = new THREE.Color();
    const side = new THREE.Color();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const h1 = hash2(c.gx * 16 + i, c.gz * 16 + j, seed + 301);
        const h2 = hash2(c.gx * 16 + i, c.gz * 16 + j, seed + 302);
        const h3 = hash2(c.gx * 16 + i, c.gz * 16 + j, seed + 303);
        const px = cx - T / 2 + (i + 0.5) * cellStep + (h1 - 0.5) * 0.22;
        const pz = cz - T / 2 + (j + 0.5) * cellStep + (h2 - 0.5) * 0.22;
        const r = cellStep * (0.4 + h3 * 0.08);
        if (c.round > 0 && modularCornerCut(mod, c, px, pz)) continue;
        const sides = 6;
        const rot = h1 * Math.PI;
        const ring = [];
        for (let k = 0; k < sides; k++) {
          const a = rot + (k / sides) * Math.PI * 2;
          const rr = r * (0.82 + hash2(k, i * 31 + j, seed + c.gx * 7 + c.gz * 13) * 0.3);
          const x = px + Math.cos(a) * rr;
          const z = pz + Math.sin(a) * rr * 0.92;
          const ground = modularCellTopAt(mod, c, Math.min(cx + T / 2 - 1e-3, Math.max(cx - T / 2 + 1e-3, x)), Math.min(cz + T / 2 - 1e-3, Math.max(cz - T / 2 + 1e-3, z)));
          ring.push({ x, z, ground });
        }
        const g0 = modularCellTopAt(mod, c, px, pz);
        const top = [px, g0 + 0.09, pz];
        col.setHex(PALETTE.cobbleStone).lerp(_c.setHex(PALETTE.cobbleStone2), h2);
        side.copy(col).multiplyScalar(0.82);
        for (let k = 0; k < sides; k++) {
          const p = ring[k], q = ring[(k + 1) % sides];
          const pt = [p.x, p.ground + 0.07, p.z], qt = [q.x, q.ground + 0.07, q.z];
          const pb = [p.x, p.ground - 0.03, p.z], qb = [q.x, q.ground - 0.03, q.z];
          buf.tri(top, pt, qt, col, col, col, UP);
          const out = [(p.x + q.x) / 2 - px, 0.2, (p.z + q.z) / 2 - pz];
          buf.quad(pb, qb, qt, pt, side, out);
        }
      }
    }
  };

  // ------------------------------------------------------------ bordes
  const STEPS = modularStairSteps(mod);
  const stairBoundaries = () => {
    const ts = [0, 1];
    for (let k = 1; k < STEPS; k++) {
      ts.push(k / STEPS - 5e-4, k / STEPS + 5e-4);
    }
    return ts.sort((a, b) => a - b);
  };
  /** Muestras a lo largo de un lado (≈1 m) entre t0 y t1. */
  const uniformT = (t0, t1) => {
    const n = Math.max(2, Math.ceil((t1 - t0) * T));
    const ts = [];
    for (let i = 0; i <= n; i++) ts.push(t0 + (t1 - t0) * (i / n));
    return ts;
  };

  /** Colisionador fino a lo largo de un tramo recto (dentro de la tesela alta). */
  const pushEdgeCollider = (pts) => {
    let minTop = Infinity, maxBot = -Infinity, minBot = Infinity;
    for (const p of pts) { minTop = Math.min(minTop, p.top); maxBot = Math.max(maxBot, p.bot); minBot = Math.min(minBot, p.bot); }
    if (minTop - maxBot <= COLLIDE_MIN_DROP) return;
    const th = 0.3;
    const xs = [], zs = [];
    for (const p of [pts[0], pts[pts.length - 1]]) {
      xs.push(p.x, p.x - p.nx * th);
      zs.push(p.z, p.z - p.nz * th);
    }
    colliders.push({
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: minBot - 0.5, maxY: minTop,
      minZ: Math.min(...zs), maxZ: Math.max(...zs),
      role: 'terrainEdge',
    });
  };

  const buildEdges = (c) => {
    const cx = c.gx * T, cz = c.gz * T;
    const lowY = modularLevelY(mod, c.level);
    const corners = c.round > 0 ? modularCellCorners(mod, c) : [null, null, null, null];
    // Arcos de las esquinas redondeadas.
    for (let i = 0; i < 4; i++) {
      const k = corners[i];
      if (!k) continue;
      const arc = arcPoints(c, k, i).map((p) => ({ ...p, top: lowY, bot: Math.min(lowY, k.outside ? outsideY(p.x, p.z) : k.y) }));
      if (arc.every((p) => p.top - p.bot <= 0.02)) continue;
      const buf = bufFor(cx, cz);
      if (c.edge === 'wall') {
        for (let j = 0; j < arc.length - 1; j++) {
          const a = arc[j], b = arc[j + 1];
          const out = [(a.nx + b.nx) / 2, 0, (a.nz + b.nz) / 2];
          buildWallFace(c, [{ ...a, t: 0 }, { ...b, t: 1 }], out, buf, j);
        }
      } else {
        buildCliffFace(c, arc, null, buf);
      }
      for (let j = 0; j < arc.length - 1; j++) pushEdgeCollider([arc[j], arc[j + 1]]);
    }
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = MODULAR_DIRS[d];
      const n = cellAt(c.gx + dx, c.gz + dz);
      const perp = [-dz, dx];
      const isLowSideOfStairs = c.shape === 'stairs' && d === (c.dir + 2) % 4;
      const stairsInvolved = (c.shape === 'stairs' && d % 2 !== c.dir % 2) || (n && n.shape === 'stairs' && d % 2 !== n.dir % 2);
      const t0 = corners[d] ? corners[d].R / T : 0;
      const t1 = corners[(d + 1) % 4] ? 1 - corners[(d + 1) % 4].R / T : 1;
      if (t1 - t0 < 1e-3) continue;
      const ts = stairsInvolved ? stairBoundaries() : uniformT(t0, t1);
      const ex = cx + dx * T / 2, ez = cz + dz * T / 2;
      const pts = [];
      let anyDrop = false;
      for (const t of ts) {
        const x = ex + perp[0] * (t - 0.5) * T;
        const z = ez + perp[1] * (t - 0.5) * T;
        const ix = x - dx * 1e-3, iz = z - dz * 1e-3;
        const ox = x + dx * 1e-3, oz = z + dz * 1e-3;
        // Muestras en los extremos se desplazan un poco hacia dentro del borde.
        const tx = ix + perp[0] * (t <= t0 ? 1e-3 : t >= t1 ? -1e-3 : 0);
        const tz = iz + perp[1] * (t <= t0 ? 1e-3 : t >= t1 ? -1e-3 : 0);
        const top = isLowSideOfStairs ? lowY : modularCellTopAt(mod, c, tx, tz);
        const bx = ox + perp[0] * (t <= t0 ? 1e-3 : t >= t1 ? -1e-3 : 0);
        const bz = oz + perp[1] * (t <= t0 ? 1e-3 : t >= t1 ? -1e-3 : 0);
        let bot = n ? modularCellTopAt(mod, n, bx, bz) : outsideY(x, z);
        if (bot > top) bot = top;
        if (top - bot > 0.02) anyDrop = true;
        pts.push({ x, z, top, bot, t, nx: dx, nz: dz });
      }
      if (!anyDrop) continue;
      const buf = bufFor(cx, cz);
      const out = [dx, 0, dz];
      const style = c.shape === 'stairs' ? 'stone' : c.edge;
      if (style === 'wall') buildWallFace(c, pts, out, buf, d);
      else if (style === 'stone') buildStoneFace(pts, out, buf);
      else buildCliffFace(c, pts, out, buf);

      // Colisionador fino dentro de la tesela alta: bots y balas lo respetan.
      pushEdgeCollider(pts);
    }
  };

  /** Acantilado: banda de césped + roca facetada que se hunde hacia dentro. */
  const buildCliffFace = (c, pts, _out, buf) => {
    const qOut = (a, b) => [(a.nx + b.nx) / 2, 0, (a.nz + b.nz) / 2];
    const lipHex = c.surface === 'grass' ? PALETTE.lipGrass : c.surface === 'path' ? PALETTE.pathDark : c.surface === 'sand' ? 0xd9c58a : PALETTE.wallStone2;
    const lipCol = new THREE.Color(lipHex);
    const lipCol2 = shade(lipHex, 0.82);
    const K = pts.length;
    const lipY = pts.map((p) => Math.max(p.bot, p.top - LIP));
    // Banda de césped
    for (let i = 0; i < K - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      if (p.top - p.bot < 0.02 && q.top - q.bot < 0.02) continue;
      buf.quad([p.x, p.top, p.z], [q.x, q.top, q.z], [q.x, lipY[i + 1], q.z], [p.x, lipY[i], p.z], lipCol, qOut(p, q), lipCol, lipCol2, lipCol2);
    }
    // Roca facetada
    let maxRock = 0;
    for (let i = 0; i < K; i++) maxRock = Math.max(maxRock, lipY[i] - pts[i].bot);
    if (maxRock < 0.05) return;
    const R = Math.max(1, Math.ceil(maxRock / ROCK_ROW));
    const grid = [];
    const stairsLike = pts.some((p, i) => i > 0 && Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) < 0.01);
    let segLen = Infinity;
    for (let i = 1; i < K; i++) segLen = Math.min(segLen, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) || Infinity);
    if (!Number.isFinite(segLen)) segLen = 1;
    for (let i = 0; i < K; i++) {
      const p = pts[i];
      const colV = [];
      for (let j = 0; j <= R; j++) {
        let y = lipY[i] + (p.bot - lipY[i]) * (j / R);
        let x = p.x, z = p.z;
        const edgeCol = i === 0 || i === K - 1;
        if (!edgeCol && j > 0) {
          const h = hpos(x, y, z, seed + 77);
          const h2 = hpos(x, y, z, seed + 78);
          // Cada columna tiene su propio "bloque" de roca: facetas grandes y verticales.
          const colBase = hpos(p.x, 0, p.z, seed + 79);
          const inset = j === R ? 0.08 + h * 0.15 : 0.12 + colBase * 0.45 + h * 0.25;
          x -= p.nx * inset;
          z -= p.nz * inset;
          if (j < R) y += (h2 - 0.5) * (lipY[i] - p.bot) / R * 0.45;
          if (!stairsLike) {
            const along = (h2 - 0.5) * Math.min(0.35, segLen * 0.3);
            x += -p.nz * along;
            z += p.nx * along;
          }
        }
        colV.push([x, y, z]);
      }
      grid.push(colV);
    }
    const col = new THREE.Color();
    for (let i = 0; i < K - 1; i++) {
      for (let j = 0; j < R; j++) {
        const a = grid[i][j], b = grid[i + 1][j], cc = grid[i + 1][j + 1], d = grid[i][j + 1];
        if (Math.abs(a[1] - d[1]) < 0.01 && Math.abs(b[1] - cc[1]) < 0.01) continue;
        const h = hpos(a[0] + b[0], a[1], a[2] + b[2], seed + 91);
        rockColor((a[1] + cc[1]) / 2, h, col);
        const col2 = rockColor((a[1] + cc[1]) / 2, hpos(cc[0], cc[1], cc[2], seed + 92), new THREE.Color());
        const out = qOut(pts[i], pts[i + 1]);
        if (h > 0.5) {
          buf.tri(a, b, cc, col, col, col, out);
          buf.tri(a, cc, d, col2, col2, col2, out);
        } else {
          buf.tri(a, b, d, col, col, col, out);
          buf.tri(b, cc, d, col2, col2, col2, out);
        }
      }
    }
  };

  /** Cara lisa de piedra (laterales de escaleras). */
  const buildStoneFace = (pts, out, buf) => {
    const col = new THREE.Color(PALETTE.stairRiser);
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      if (p.top - p.bot < 0.02 && q.top - q.bot < 0.02) continue;
      buf.quad([p.x, p.top, p.z], [q.x, q.top, q.z], [q.x, q.bot, q.z], [p.x, p.bot, p.z], col, out);
    }
  };

  /** Caja en relieve: cara frontal desplazada `o` fuera del plano + 4 laterales. */
  const reliefBox = (buf, a0, a1, y0, y1, base, dirOut, along, o, col, colSide) => {
    const P = (s, y, off) => [base[0] + along[0] * s + dirOut[0] * off, y, base[2] + along[1] * s + dirOut[2] * off];
    const out = dirOut;
    const f00 = P(a0, y0, o), f10 = P(a1, y0, o), f11 = P(a1, y1, o), f01 = P(a0, y1, o);
    const b00 = P(a0 - 0.02, y0 - 0.02, 0), b10 = P(a1 + 0.02, y0 - 0.02, 0), b11 = P(a1 + 0.02, y1 + 0.02, 0), b01 = P(a0 - 0.02, y1 + 0.02, 0);
    buf.quad(f00, f10, f11, f01, col, out);
    buf.quad(f01, f11, b11, b01, colSide, [out[0], 1, out[2]]);
    buf.quad(b00, b10, f10, f00, colSide, [out[0], -1, out[2]]);
    buf.quad(b00, f00, f01, b01, colSide, [out[0] - along[0], 0, out[2] - along[1]]);
    buf.quad(f10, b10, b11, f11, colSide, [out[0] + along[0], 0, out[2] + along[1]]);
  };

  /** Muro de terraza: llagas oscuras, sillares en relieve y piedras de remate. */
  const buildWallFace = (c, pts, out, buf) => {
    const mortar = new THREE.Color(PALETTE.mortar);
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      if (p.top - p.bot < 0.02 && q.top - q.bot < 0.02) continue;
      buf.quad([p.x, p.top, p.z], [q.x, q.top, q.z], [q.x, q.bot, q.z], [p.x, p.bot, p.z], mortar, out);
    }
    const first = pts[0], last = pts[pts.length - 1];
    const len = Math.hypot(last.x - first.x, last.z - first.z);
    const along = [(last.x - first.x) / len, (last.z - first.z) / len];
    const base = [first.x, 0, first.z];
    const topAt = (s) => {
      const t = s / len;
      for (let i = 0; i < pts.length - 1; i++) {
        if (t <= pts[i + 1].t || i === pts.length - 2) {
          const k = (t - pts[i].t) / Math.max(1e-6, pts[i + 1].t - pts[i].t);
          return { top: pts[i].top + (pts[i + 1].top - pts[i].top) * k, bot: pts[i].bot + (pts[i + 1].bot - pts[i].bot) * k };
        }
      }
      return { top: last.top, bot: last.bot };
    };
    let minBot = Infinity, maxTop = -Infinity, flatTop = true;
    for (const p of pts) { minBot = Math.min(minBot, p.bot); maxTop = Math.max(maxTop, p.top); if (Math.abs(p.top - pts[0].top) > 0.01) flatTop = false; }
    const rowH = 0.42;
    const stone = new THREE.Color();
    const stoneSide = new THREE.Color();
    const capTopY = flatTop ? pts[0].top - 0.1 : maxTop;
    for (let r = 0, y = minBot; y < capTopY - 0.1; r++, y += rowH) {
      let s = (r % 2) * -0.45;
      let b = 0;
      while (s < len) {
        const h = hash2(c.gx * 97 + r * 13 + b, c.gz * 89 + Math.round(base[0] + base[2]), seed + 55);
        const w = 0.75 + h * 0.35;
        const a0 = Math.max(0.03, s + 0.03);
        const a1 = Math.min(len - 0.03, s + w - 0.03);
        s += w; b++;
        if (a1 - a0 < 0.15) continue;
        const e0 = topAt(a0), e1 = topAt(a1);
        const y0 = Math.max(y + 0.03, Math.max(e0.bot, e1.bot) + 0.02);
        const y1 = Math.min(y + rowH - 0.03, Math.min(e0.top, e1.top) - (flatTop ? 0.1 : 0.03));
        if (y1 - y0 < 0.1) continue;
        stone.setHex(PALETTE.wallStone).lerp(_c.setHex(PALETTE.wallStone2), h);
        stoneSide.copy(stone).multiplyScalar(0.8);
        reliefBox(buf, a0, a1, y0, y1, base, out, along, 0.05 + h * 0.05, stone, stoneSide);
      }
    }
    // Piedras de remate sobre el borde (solo en bordes horizontales).
    if (flatTop && pts[0].top - minBot >= 0.4) {
      const topY = pts[0].top;
      let s = 0, b = 0;
      while (s < len - 0.2) {
        const h = hash2(c.gx * 131 + b, c.gz * 151 + Math.round(base[0] * 3 + base[2]), seed + 66);
        const w = Math.min(len - s, 0.8 + h * 0.3);
        const a0 = s + 0.04, a1 = s + w - 0.04;
        s += w; b++;
        const cap = new THREE.Color(PALETTE.capStone).multiplyScalar(0.92 + h * 0.12);
        const capSide = cap.clone().multiplyScalar(0.84);
        // Caja de remate con la tapa achaflanada (aspecto redondeado).
        const inward = [-out[0], 0, -out[2]];
        const P = (sa, y, off) => [base[0] + along[0] * sa + out[0] * off, y, base[2] + along[1] * sa + out[2] * off];
        const y0 = topY - 0.14, y1 = topY + 0.16 + h * 0.06, ch = 0.07;
        const fo = 0.08, bo = -0.5;
        const ring0 = [P(a0, y0, fo), P(a1, y0, fo), P(a1, y0, bo), P(a0, y0, bo)];
        const ring1 = [P(a0, y1 - ch, fo), P(a1, y1 - ch, fo), P(a1, y1 - ch, bo), P(a0, y1 - ch, bo)];
        const ring2 = [P(a0 + ch, y1, fo - ch), P(a1 - ch, y1, fo - ch), P(a1 - ch, y1, bo + ch), P(a0 + ch, y1, bo + ch)];
        const outs = [out, [along[0], 0, along[1]], inward, [-along[0], 0, -along[1]]];
        const faceOrder = [[0, 1], [1, 2], [2, 3], [3, 0]];
        for (let k = 0; k < 4; k++) {
          const [i0, i1] = faceOrder[k];
          const o = outs[k];
          buf.quad(ring0[i0], ring0[i1], ring1[i1], ring1[i0], capSide, o);
          buf.quad(ring1[i0], ring1[i1], ring2[i1], ring2[i0], cap, [o[0], 1, o[2]]);
        }
        buf.quad(ring2[0], ring2[1], ring2[2], ring2[3], cap, UP);
      }
    }
  };

  // ------------------------------------------------------------ escaleras
  const buildStairs = (c) => {
    if (c.shape !== 'stairs') return;
    const cx = c.gx * T, cz = c.gz * T;
    const buf = bufFor(cx, cz);
    const [dx, dz] = MODULAR_DIRS[c.dir];
    const perp = [-dz, dx];
    const low = modularLevelY(mod, c.level);
    const steps = STEPS;
    const sh = L / steps;
    const P = (u, w, y) => [cx - dx * T / 2 + dx * u * T + perp[0] * (w - 0.5) * T, y, cz - dz * T / 2 + dz * u * T + perp[1] * (w - 0.5) * T];
    const back = [-dx, 0, -dz];
    for (let k = 0; k < steps; k++) {
      const u0 = k / steps, u1 = (k + 1) / steps;
      const y0 = low + k * sh, y1 = low + (k + 1) * sh;
      const h = hash2(c.gx * 7 + k, c.gz * 11, seed + 404);
      const tread = new THREE.Color(PALETTE.stairTread).multiplyScalar(0.95 + h * 0.08);
      const riser = new THREE.Color(PALETTE.stairRiser).multiplyScalar(0.95 + h * 0.06);
      // Nariz del peldaño: sobresale 4 cm.
      const nose = 0.04 / T;
      buf.quad(P(u0 - nose, 0, y1), P(u0 - nose, 1, y1), P(u1, 1, y1), P(u1, 0, y1), tread, UP);
      buf.quad(P(u0 - nose, 0, y0), P(u0 - nose, 1, y0), P(u0 - nose, 1, y1), P(u0 - nose, 0, y1), riser, back);
    }
  };

  for (const c of mod.cells.values()) {
    buildTop(c);
    buildStairs(c);
    buildEdges(c);
  }

  // ------------------------------------------------------------ resultado
  const group = new THREE.Group();
  group.name = 'modular-terrain';
  const material = makeModularTerrainMaterial();
  const geometries = [];
  let tris = 0;
  for (const buf of buffers.values()) {
    if (!buf.count) continue;
    const geo = buf.toGeometry();
    geometries.push(geo);
    tris += buf.count;
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = !!opts.shadows;
    mesh.receiveShadow = !!opts.shadows;
    mesh.frustumCulled = true;
    mesh.name = 'modular-terrain-block';
    group.add(mesh);
  }
  return {
    group,
    colliders,
    material,
    stats: { cells: mod.cells.size, blocks: geometries.length, triangles: tris, colliders: colliders.length },
    dispose() {
      for (const g of geometries) g.dispose();
      material.dispose();
      group.removeFromParent();
    },
  };
}
