import fs from 'node:fs';
import path from 'node:path';

// --- noise/utils (same as src/core/utils.js) ---
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smoothstep(x - xi), yf = smoothstep(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
}
function fbm(x, y, seed = 0, octaves = 5, lacunarity = 2.02, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, y * freq, seed + i * 1013) * amp;
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

// --- terrain height (mirrors World) ---
function makeHeightFns(map) {
  const seed = (map.seed || 1) >>> 0;
  const size = map.size || 360;
  const half = size / 2;
  const waterLevel = map.waterLevel ?? 0;
  const biome = map.biome || {};
  const mountainHeight = biome.mountainHeight ?? 26;
  const pois = map.pois || [];

  function rawHeightAt(x, z) {
    const b = biome;
    const f = b.frequency || 0.012;
    const n = fbm(x * f, z * f, seed, 5);
    const broad = fbm(x * f * 0.38 + 30, z * f * 0.38 - 20, seed + 991, 3);
    const ridge = 1 - Math.abs(fbm(x * f * 1.6, z * f * 1.6, seed + 451, 3) * 2 - 1);
    const detail = noise2(x * 0.035, z * 0.035, seed + 77) - 0.5;
    let h = (b.baseHeight ?? 10) + (n - 0.5) * (b.amplitude ?? 9) * 2
      + (broad - 0.5) * (b.amplitude ?? 9) * 1.1
      + ridge * ridge * (b.roughness ?? 3.5) * 1.8 + detail * 1.6;
    const wobble = noise2(x * 0.0042, z * 0.0042, seed + 909);
    h += (wobble - 0.5) * 0.9;
    const mountainField = fbm(x * f * 0.6 + 120, z * f * 0.6 - 85, seed + 3337, 3);
    const peak = Math.pow(clamp((mountainField - 0.48) / 0.28, 0, 1), 1.4);
    h += peak * mountainHeight;

    if (map.island) {
      const angle = Math.atan2(z, x);
      const coastNoise = fbm(x * 0.0042 + 61, z * 0.0042 - 37, seed + 7777, 3);
      const coastNoise2 = fbm(x * 0.009 + 11, z * 0.009 + 23, seed + 8123, 2);
      const lobes = 0.14 * Math.sin(angle * 3 + 0.9)
        + 0.1 * Math.sin(angle * 5.2 - 1.5)
        + 0.07 * Math.sin(angle * 7.8 + 2.1)
        + 0.045 * Math.sin(angle * 11.0 - 0.6)
        + (coastNoise - 0.5) * 0.42
        + (coastNoise2 - 0.5) * 0.18;
      const coastR = half * clamp(1.0 + lobes, 0.68, 1.18);
      const r = Math.hypot(x, z) / coastR;
      const t = smoothstep(clamp((r - 0.8) / 0.2, 0, 1));
      h = lerp(h, waterLevel - 20, t);
      const shore = smoothstep(clamp((r - 0.66) / 0.1, 0, 1))
        * (1 - smoothstep(clamp((r - 0.92) / 0.08, 0, 1)));
      if (shore > 0) {
        const cliff = smoothstep(clamp((coastNoise - 0.52) / 0.16, 0, 1));
        const limit = waterLevel + lerp(1.3, 11, cliff) + detail * 0.8;
        if (h > limit) h = lerp(h, limit, shore);
      }
      for (const poi of pois) {
        const dx = x - poi.x, dz = z - poi.z;
        const d = Math.hypot(dx, dz);
        const rr = (poi.radius || 20) * 0.78;
        if (d < rr) {
          const k = smoothstep(1 - d / rr);
          h = Math.max(h, lerp(h, waterLevel + 2.6, k));
        }
      }
    }
    return h;
  }

  const poiFlatHeights = new Map();
  for (const poi of pois) {
    poiFlatHeights.set(poi.name, Math.max(rawHeightAt(poi.x, poi.z), waterLevel + 2.4));
  }

  function heightAt(x, z) {
    let h = rawHeightAt(x, z);
    for (const poi of pois) {
      const dx = x - poi.x, dz = z - poi.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist >= poi.radius) continue;
      const flat = Math.max(poiFlatHeights.get(poi.name) ?? h, waterLevel + 1.8);
      const t = smoothstep(clamp((dist - poi.radius * 0.52) / (poi.radius * 0.48), 0, 1));
      h = lerp(flat, h, t);
    }
    return h;
  }

  return { heightAt, rawHeightAt, waterLevel, half, size, seed };
}

// --- placement helpers ---
const GRID = 2;
const snap = (v) => Math.round(v / GRID) * GRID;

function rotateSize(w, d, rot) {
  const k = ((Math.round((rot || 0) / (Math.PI / 2)) % 4) + 4) % 4;
  return k % 2 ? { w: d, d: w } : { w, d };
}

function sampleFootprint(heightAt, x, z, w, d, rot) {
  const r = rotateSize(w, d, rot);
  const hx = r.w / 2, hz = r.d / 2;
  const xs = [-hx, -hx * 0.5, 0, hx * 0.5, hx];
  const zs = [-hz, -hz * 0.5, 0, hz * 0.5, hz];
  let minY = Infinity, maxY = -Infinity, sum = 0, n = 0;
  for (const dx of xs) for (const dz of zs) {
    const y = heightAt(x + dx, z + dz);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    sum += y; n++;
  }
  const centerY = heightAt(x, z);
  return { minY, maxY, avgY: sum / n, centerY, range: maxY - minY };
}

function isPlain(heightAt, waterLevel, x, z, radius = 8, maxRange = 0.6) {
  const info = sampleFootprint(heightAt, x, z, radius * 2, radius * 2, 0);
  if (info.centerY < waterLevel + 2.2) return false;
  if (info.centerY > waterLevel + 18) return false;
  if (info.range > maxRange) return false;
  if (info.minY < waterLevel + 1.6) return false;
  return true;
}

function occupied(occ, x, z, w, d, rot) {
  const r = rotateSize(w, d, rot);
  const hx = r.w / 2, hz = r.d / 2;
  for (let ix = Math.floor((x - hx) / GRID) * GRID; ix <= Math.ceil((x + hx) / GRID) * GRID; ix += GRID) {
    for (let iz = Math.floor((z - hz) / GRID) * GRID; iz <= Math.ceil((z + hz) / GRID) * GRID; iz += GRID) {
      if (ix >= x - hx && ix < x + hx && iz >= z - hz && iz < z + hz) {
        if (occ.has(`${ix},${iz}`)) return true;
      }
    }
  }
  return false;
}
function markOcc(occ, x, z, w, d, rot, margin = 0) {
  const r = rotateSize(w, d, rot);
  const hx = r.w / 2 + margin, hz = r.d / 2 + margin;
  for (let ix = Math.floor((x - hx) / GRID) * GRID; ix <= Math.ceil((x + hx) / GRID) * GRID; ix += GRID) {
    for (let iz = Math.floor((z - hz) / GRID) * GRID; iz <= Math.ceil((z + hz) / GRID) * GRID; iz += GRID) {
      if (ix >= x - hx && ix < x + hx && iz >= z - hz && iz < z + hz) occ.add(`${ix},${iz}`);
    }
  }
}

function getNatureZone(x, z, heightAt, waterLevel, seed) {
  const y = heightAt(x, z);
  const coast = y - waterLevel;
  if (coast < 3.2) return 'beach';
  const n = noise2(x * 0.018 + 40, z * 0.018 - 25, seed + 881);
  const n2 = noise2(x * 0.006 - 15, z * 0.006 + 60, seed + 177);
  const interior = coast > 3.5 && coast < 18;
  const forestMask = n * 0.65 + n2 * 0.35;
  if (interior && forestMask > 0.46) return 'forest';
  return forestMask > 0.62 ? 'forest' : 'terrain';
}

function placePiece(pieces, occ, heightAt, waterLevel, type, x, z, rot = 0, extra = null) {
  x = snap(x); z = snap(z);
  const [w, d, margin] = pieceFootprint(type);
  if (occupied(occ, x, z, w, d, rot)) return false;

  const info = sampleFootprint(heightAt, x, z, Math.max(w, 2), Math.max(d, 2), rot);
  const small = type === 'crate' || type === 'barrel' || type === 'lamp' || type === 'bench' || type === 'bush' || type === 'fence' || type === 'column';
  if (type !== 'road' && type !== 'tree' && type !== 'rock' && !small) {
    if (info.centerY < waterLevel + 2.4) return false;
    if (info.minY < waterLevel + 1.8) return false;
    if (info.range > 1.1) return false; // huella suficientemente plana para construir (base + cimiento)
  } else if (type === 'road') {
    if (info.centerY < waterLevel + 1.8) return false;
    if (info.minY < waterLevel + 1.2) return false;
    if (info.range > 1.35) return false; // permite caminos suaves en laderas ligeras
  } else {
    if (info.centerY < waterLevel + 1.8) return false;
    if (info.minY < waterLevel + 1.2) return false;
    if (!small && info.range > 1.4) return false;
  }

  // Base nivelada: alinear a rejilla vertical de 2 studs (2x2x2) minimizando huecos
  let baseY = info.centerY;
  if (type !== 'road' && type !== 'tree' && type !== 'rock' && !small) {
    baseY = Math.round(info.maxY / GRID) * GRID;
    if (baseY < info.maxY - 0.05) baseY += GRID; // asegurar que no se hunda
  } else if (type === 'road') {
    baseY = Math.round(info.centerY * 20) / 20;
  } else {
    baseY = Math.round(info.centerY * 20) / 20;
  }

  const piece = { type, x, y: Math.round(baseY * 100) / 100, z, rot };
  if (extra && (type === 'house' || type === 'cabin') && extra.floors > 1) piece.floors = Math.max(1, Math.min(3, Math.round(extra.floors)));
  pieces.push(piece);
  markOcc(occ, x, z, w, d, rot, margin);
  return true;
}

function tryPlaceNear(pieces, occ, heightAt, waterLevel, type, cx, cz, radius, rotChoices, tries = 30, rnd = Math.random, extra = null) {
  for (let i = 0; i < tries; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * radius;
    const x = snap(cx + Math.cos(a) * r);
    const z = snap(cz + Math.sin(a) * r);
    const rot = rotChoices[Math.floor(rnd() * rotChoices.length)];
    if (placePiece(pieces, occ, heightAt, waterLevel, type, x, z, rot, extra)) return true;
  }
  return false;
}

function pieceFootprint(type) {
  const sizes = {
    house: [8, 6, 3], cabin: [4, 4, 2], tower: [5, 5, 2], container: [6, 2.4, 1], wall: [2, 0.4, 1], wall_corner: [2, 2, 1], column: [0.5, 0.5, 0],
    tree: [3, 3, 1], rock: [2.5, 2.5, 1], bush: [1.6, 1.6, 0], road: [4, 4, 0],
    crate: [1.2, 1.2, 0], barrel: [1.2, 1.2, 0], lamp: [0.8, 0.8, 0], bench: [2, 1, 0], fence: [2, 0.4, 0],
  };
  return sizes[type] || [4, 4, 1];
}

function main() {
  const mapPath = path.resolve('public/maps/san-borondon.json');
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const { heightAt, waterLevel, half, seed } = makeHeightFns(map);
  const rnd = makeRandom(seed + 4242);
  const pieces = [];
  const occ = new Set();
  const ROTS = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const settlementCenters = [];

  function canBuildArea(cx, cz, radius = 10, maxRange = 1.7) {
    const offsets = [[0, 0], [radius * 0.5, 0], [-radius * 0.5, 0], [0, radius * 0.5], [0, -radius * 0.5], [radius, 0], [-radius, 0], [0, radius], [0, -radius]];
    for (const [dx, dz] of offsets) {
      const info = sampleFootprint(heightAt, cx + dx, cz + dz, 6, 6, 0);
      if (info.centerY < waterLevel + 2.2 || info.minY < waterLevel + 1.6) return false;
      if (info.range > maxRange) return false;
    }
    return true;
  }

  function findPlains(count, minDist, opts = {}) {
    const found = [];
    const maxAttempts = opts.maxAttempts || 14000;
    const maxRange = opts.maxRange || 1.9;
    const radius = opts.radius || 12;
    let attempts = 0;
    while (found.length < count && attempts < maxAttempts) {
      attempts++;
      const x = snap((rnd() * 2 - 1) * (half * 0.7));
      const z = snap((rnd() * 2 - 1) * (half * 0.7));
      if (!canBuildArea(x, z, radius, maxRange)) continue;
      if (found.some((p) => Math.hypot(p.x - x, p.z - z) < minDist)) continue;
      found.push({ x, z, y: heightAt(x, z) });
    }
    return found;
  }

  function flattenSpot(x, z, tries = 18, radius = 8) {
    let bx = snap(x), bz = snap(z), br = 99;
    const base = sampleFootprint(heightAt, bx, bz, 4, 4, 0);
    br = base.range;
    for (let i = 0; i < tries; i++) {
      const a = (i / tries) * Math.PI * 2;
      const r = (i % 3) * (radius / 2);
      const tx = snap(x + Math.cos(a) * r), tz = snap(z + Math.sin(a) * r);
      const info = sampleFootprint(heightAt, tx, tz, 4, 4, 0);
      if (info.centerY < waterLevel + 2.0 || info.minY < waterLevel + 1.4) continue;
      if (info.range < br) { br = info.range; bx = tx; bz = tz; }
      if (br <= 1.2) break;
    }
    return { x: bx, z: bz, y: heightAt(bx, bz), range: br };
  }

  function roadOk(x, z) {
    const info = sampleFootprint(heightAt, x, z, 4, 4, 0);
    return info.centerY >= waterLevel + 1.6 && info.minY >= waterLevel + 1.1 && info.range <= 1.7;
  }

  function placeRoadTile(x, z) {
    x = snap(x); z = snap(z);
    if (!roadOk(x, z)) return false;
    for (const p of pieces) if (p.type === 'road' && p.x === x && p.z === z) return true;
    const info = sampleFootprint(heightAt, x, z, 4, 4, 0);
    const y = Math.round(info.centerY * 20) / 20;
    for (const p of pieces) if (p.x === x && p.z === z && p.type !== 'road') return false;
    if (occupied(occ, x, z, 4, 4, 0)) {
      const conflict = pieces.some((p) => p.type !== 'road' && Math.abs(p.x - x) < 2.5 && Math.abs(p.z - z) < 2.5);
      if (conflict) return false;
    }
    pieces.push({ type: 'road', x, y, z, rot: 0 });
    markOcc(occ, x, z, 4, 4, 0, 0);
    return true;
  }

  function carveRoadPath(x1, z1, x2, z2) {
    let x = snap(x1), z = snap(z1);
    const tx = snap(x2), tz = snap(z2);
    let placed = 0;
    const maxSteps = 260;
    for (let i = 0; i < maxSteps; i++) {
      if (placeRoadTile(x, z)) placed++;
      if (x === tx && z === tz) break;
      const dx = tx - x, dz = tz - z;
      const stepX = dx === 0 ? 0 : Math.sign(dx) * 4;
      const stepZ = dz === 0 ? 0 : Math.sign(dz) * 4;
      let nx = x, nz = z;
      if (Math.abs(dx) >= Math.abs(dz) && stepX) { nx = x + stepX; nz = z; }
      else if (stepZ) { nx = x; nz = z + stepZ; }
      else if (stepX) { nx = x + stepX; nz = z; }
      if (!roadOk(nx, nz)) {
        if (nx !== x && stepZ && roadOk(x, z + stepZ)) { nx = x; nz = z + stepZ; }
        else if (nz !== z && stepX && roadOk(x + stepX, z)) { nx = x + stepX; nz = z; }
        else if (stepX && roadOk(x + stepX, z)) { nx = x + stepX; nz = z; }
        else if (stepZ && roadOk(x, z + stepZ)) { nx = x; nz = z + stepZ; }
        else { nx += stepX || 0; nz += stepZ || 0; }
      }
      x = snap(nx); z = snap(nz);
    }
    return placed;
  }

  function placeHouseSmart(cx, cz, rot, floors = 1, spread = 8) {
    for (let r = 0; r <= spread; r += 2) {
      const tries = r === 0 ? 1 : 10;
      for (let a = 0; a < tries; a++) {
        const ang = r === 0 ? 0 : (a / tries) * Math.PI * 2;
        const jx = r === 0 ? 0 : snap(Math.cos(ang) * r);
        const jz = r === 0 ? 0 : snap(Math.sin(ang) * r);
        const hx = snap(cx + jx), hz = snap(cz + jz);
        if (placePiece(pieces, occ, heightAt, waterLevel, 'house', hx, hz, rot, { floors })) return true;
      }
    }
    return false;
  }

  function decorateAround(cx, cz, radius = 10, count = 4) {
    const types = ['crate', 'barrel', 'lamp', 'bench', 'bush', 'rock'];
    let placed = 0;
    for (let i = 0; i < count * 5 && placed < count; i++) {
      const t = types[Math.floor(rnd() * types.length)];
      if (tryPlaceNear(pieces, occ, heightAt, waterLevel, t, cx, cz, radius, ROTS, 10, rnd)) placed++;
    }
    return placed;
  }

  function placeSettlementWalls(cx, cz, half = 26, inner = 16) {
    // Murales perimetrales modulares alrededor del asentamiento: vallas sin
    // huecos, esquinas y ventanas. Los puertas se intentan sobre las rampas
    // de carretera; si chocan con el ocupado, el muro está íntegro.
    let placed = 0;
    const runH = (sideZ, rot) => {
      for (let x = snap(cx - inner); x <= snap(cx + inner) + 1; x += 4) {
        if (placePiece(pieces, occ, heightAt, waterLevel, 'wall', x, sideZ, rot)) placed++;
      }
    };
    const runV = (sideX, rot) => {
      for (let z = snap(cz - inner); z <= snap(cz + inner) + 1; z += 4) {
        if (placePiece(pieces, occ, heightAt, waterLevel, 'wall', sideX, z, rot)) placed++;
      }
    };
    runH(snap(cz - half), 0);
    runH(snap(cz + half), 0);
    runV(snap(cx - half), Math.PI / 2);
    runV(snap(cx + half), Math.PI / 2);
    tryPlaceNear(pieces, occ, heightAt, waterLevel, 'wall_door', cx, cz, 2, ROTS, 4, rnd);
    tryPlaceNear(pieces, occ, heightAt, waterLevel, 'column', cx, cz, 2, ROTS, 6, rnd);
    placePiece(pieces, occ, heightAt, waterLevel, 'wall_corner', snap(cx - half), snap(cz - half), 0);
    placePiece(pieces, occ, heightAt, waterLevel, 'wall_corner', snap(cx + half), snap(cz - half), 0);
    placePiece(pieces, occ, heightAt, waterLevel, 'wall_corner', snap(cx - half), snap(cz + half), 0);
    placePiece(pieces, occ, heightAt, waterLevel, 'wall_corner', snap(cx + half), snap(cz + half), 0);
    return placed;
  }

  function buildTown(center, opts = {}) {
    const c = flattenSpot(center.x, center.z, 24, 12);
    const cx = c.x, cz = c.z;
    const houses = opts.houses ?? 8;
    settlementCenters.push({ x: cx, z: cz, y: c.y });

    for (let i = -4; i <= 4; i++) {
      placeRoadTile(cx + i * 4, cz);
      placeRoadTile(cx, cz + i * 4);
    }
    for (let i = -2; i <= 2; i++) {
      placeRoadTile(cx + i * 4, cz - 12);
      placeRoadTile(cx + i * 4, cz + 12);
      placeRoadTile(cx - 12, cz + i * 4);
      placeRoadTile(cx + 12, cz + i * 4);
    }
    for (const [dx, dz] of [[4,4],[4,-4],[-4,4],[-4,-4],[8,8],[8,-8],[-8,8],[-8,-8]]) placeRoadTile(cx + dx, cz + dz);
    placeSettlementWalls(cx, cz);

    const slots = [
      [-16, -8, Math.PI / 2], [-16, 8, Math.PI / 2], [16, -8, -Math.PI / 2], [16, 8, -Math.PI / 2],
      [-8, -16, 0], [8, -16, 0], [-8, 16, Math.PI], [8, 16, Math.PI],
      [-24, -8, Math.PI / 2], [24, -8, -Math.PI / 2], [-24, 8, Math.PI / 2], [24, 8, -Math.PI / 2],
      [-8, -24, 0], [8, -24, 0], [-8, 24, Math.PI], [8, 24, Math.PI],
    ];
    let placedH = 0;
    for (let i = 0; i < slots.length && placedH < houses; i++) {
      const [dx, dz, rot] = slots[i];
      const floors = (i % 4 === 1) ? 2 : 1;
      if (placeHouseSmart(cx + dx, cz + dz, rot, floors, 6)) placedH++;
    }

    if (opts.tower) {
      placePiece(pieces, occ, heightAt, waterLevel, 'tower', cx - 6, cz - 6, 0) || tryPlaceNear(pieces, occ, heightAt, waterLevel, 'tower', cx, cz, 10, ROTS, 20, rnd);
    }
    for (let i = 0; i < (opts.containers || 3); i++) tryPlaceNear(pieces, occ, heightAt, waterLevel, 'container', cx, cz, 18, ROTS, 20, rnd);
    if (opts.walls) {
      for (let i = -7; i <= 7; i++) {
        if (Math.abs(i) <= 1) continue;
        placePiece(pieces, occ, heightAt, waterLevel, 'wall', cx + i * 2, cz - 22, 0);
        placePiece(pieces, occ, heightAt, waterLevel, 'wall', cx + i * 2, cz + 22, 0);
        if (i % 2 === 0) placePiece(pieces, occ, heightAt, waterLevel, 'wall', cx - 22, cz + i * 2, Math.PI / 2);
        if (i % 2 === 0) placePiece(pieces, occ, heightAt, waterLevel, 'wall', cx + 22, cz + i * 2, Math.PI / 2);
      }
    }
    decorateAround(cx, cz, 14, opts.decor || 10);
    decorateAround(cx - 12, cz, 8, 3);
    decorateAround(cx + 12, cz, 8, 3);
    return { x: cx, z: cz };
  }

  function buildHamlet(center, opts = {}) {
    const c = flattenSpot(center.x, center.z, 18, 10);
    const cx = c.x, cz = c.z;
    settlementCenters.push({ x: cx, z: cz, y: c.y });
    for (let i = -2; i <= 2; i++) placeRoadTile(cx + i * 4, cz);
    placeRoadTile(cx, cz + 4); placeRoadTile(cx, cz - 4); placeRoadTile(cx, cz + 8);
    const slots = [[-10, -8, Math.PI / 2], [10, -8, -Math.PI / 2], [-10, 8, Math.PI / 2], [10, 8, -Math.PI / 2], [0, -14, 0]];
    let n = 0;
    for (let i = 0; i < slots.length && n < (opts.houses || 3); i++) {
      const [dx, dz, rot] = slots[i];
      const floors = (i === 0 && rnd() < 0.35) ? 2 : 1;
      if (placeHouseSmart(cx + dx, cz + dz, rot, floors, 6)) n++;
    }
    tryPlaceNear(pieces, occ, heightAt, waterLevel, 'container', cx, cz, 12, ROTS, 10, rnd);
    decorateAround(cx, cz, 10, 5);
    return { x: cx, z: cz };
  }

  function buildOutpost(center) {
    const c = flattenSpot(center.x, center.z, 18, 8);
    const cx = c.x, cz = c.z;
    settlementCenters.push({ x: cx, z: cz, y: c.y });
    placePiece(pieces, occ, heightAt, waterLevel, 'tower', cx, cz, 0) || tryPlaceNear(pieces, occ, heightAt, waterLevel, 'tower', cx, cz, 6, ROTS, 20, rnd);
    for (const [dx, dz] of [[6,0],[-6,0],[0,6],[0,-6],[4,4],[-4,4],[4,-4],[-4,-4],[10,0],[-10,0],[0,10],[0,-10]]) placeRoadTile(cx + dx, cz + dz);
    placeSettlementWalls(cx, cz);
    for (let i = 0; i < 8; i++) tryPlaceNear(pieces, occ, heightAt, waterLevel, 'wall', cx, cz, 10, ROTS, 18, rnd);
    tryPlaceNear(pieces, occ, heightAt, waterLevel, 'container', cx, cz, 10, ROTS, 10, rnd);
    decorateAround(cx, cz, 8, 4);
    return { x: cx, z: cz };
  }

  const pois = (map.pois || []).map((p) => ({ ...p }));
  const townPoi = pois.find((p) => /caser/i.test(p.name || '') || p.type === 'town') || pois[1] || pois[0];
  const harborPoi = pois.find((p) => /puerto|harbor/i.test(p.name || '') || p.type === 'harbor');
  const anchors = [];
  if (townPoi) anchors.push({ kind: 'townMain', poi: townPoi });
  if (harborPoi && harborPoi !== townPoi) anchors.push({ kind: 'town', poi: harborPoi });
  for (const p of pois) {
    if (!p || p === townPoi || p === harborPoi) continue;
    if (/faro|torre|tower/i.test(p.name || '') || p.type === 'tower') anchors.push({ kind: 'outpost', poi: p });
    else if (/ruina|ermita|ruins/i.test(p.name || '') || p.type === 'ruins') anchors.push({ kind: 'outpost', poi: p });
    else anchors.push({ kind: 'hamlet', poi: p });
  }

  const built = [];
  for (const a of anchors) {
    const base = { x: snap(a.poi.x || 0), z: snap(a.poi.z || 0) };
    if (a.kind === 'townMain') built.push(buildTown(base, { houses: 10, tower: true, walls: true, containers: 4, decor: 12 }));
    else if (a.kind === 'town') built.push(buildTown(base, { houses: 7, tower: false, walls: false, containers: 3, decor: 10 }));
    else if (a.kind === 'outpost') built.push(buildOutpost(base));
    else built.push(buildHamlet(base, { houses: 3 }));
  }

  let plains = findPlains(6, 46, { maxAttempts: 16000, maxRange: 2.0, radius: 10 });
  if (plains.length < 3) plains = plains.concat(findPlains(6, 34, { maxAttempts: 14000, maxRange: 2.4, radius: 8 }));
  let extraIdx = 0;
  for (const c of plains) {
    if (settlementCenters.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 42)) continue;
    if (extraIdx === 0 && built.length < 2) built.push(buildTown(c, { houses: 6, tower: false, walls: false, containers: 2, decor: 8 }));
    else if (extraIdx % 3 === 1) built.push(buildOutpost(c));
    else built.push(buildHamlet(c, { houses: extraIdx % 2 === 0 ? 4 : 3 }));
    extraIdx++;
    if (built.length >= 8) break;
  }

  for (let i = 1; i < built.length; i++) carveRoadPath(built[i - 1].x, built[i - 1].z, built[i].x, built[i].z);
  if (built.length >= 3) carveRoadPath(built[0].x, built[0].z, built[built.length - 1].x, built[built.length - 1].z);
  if (built.length >= 4) carveRoadPath(built[1].x, built[1].z, built[3].x, built[3].z);

  function placeForestCabins(count = 12) {
    let placed = 0;
    for (let tries = 0; tries < 8000 && placed < count; tries++) {
      const x = snap((rnd() * 2 - 1) * (half * 0.72));
      const z = snap((rnd() * 2 - 1) * (half * 0.72));
      if (getNatureZone(x, z, heightAt, waterLevel, seed) !== 'forest') continue;
      const info = sampleFootprint(heightAt, x, z, 4, 4, 0);
      if (info.centerY < waterLevel + 2.6 || info.minY < waterLevel + 2.0 || info.range > 1.25) continue;
      let nearSettlement = false;
      for (const c of settlementCenters) { if (Math.hypot(c.x - x, c.z - z) < 22) { nearSettlement = true; break; } }
      if (nearSettlement) continue;
      let closeCabin = false;
      for (const p of pieces) { if (p.type === 'cabin' && Math.hypot(p.x - x, p.z - z) < 16) { closeCabin = true; break; } }
      if (closeCabin) continue;
      const rot = ROTS[Math.floor(rnd() * ROTS.length)];
      const floors = rnd() < 0.22 ? 2 : 1;
      if (placePiece(pieces, occ, heightAt, waterLevel, 'cabin', x, z, rot, { floors })) {
        placed++;
        decorateAround(x, z, 6, 2);
      }
    }
    return placed;
  }
  placeForestCabins(12);

  for (let i = 0; i < 40; i++) {
    const x = snap((rnd() * 2 - 1) * (half * 0.7));
    const z = snap((rnd() * 2 - 1) * (half * 0.7));
    const t = rnd() < 0.45 ? 'rock' : 'bush';
    tryPlaceNear(pieces, occ, heightAt, waterLevel, t, x, z, 4, ROTS, 4, rnd);
  }

  const safe = [];
  for (const p of pieces) {
    const x = snap(p.x), z = snap(p.z), rot = p.rot || 0;
    const [w, d] = pieceFootprint(p.type);
    const info = sampleFootprint(heightAt, x, z, Math.max(w, 2), Math.max(d, 2), rot);
    const small = p.type === 'crate' || p.type === 'barrel' || p.type === 'lamp' || p.type === 'bench' || p.type === 'bush' || p.type === 'fence';
    if (p.type === 'road') {
      if (info.centerY < waterLevel + 1.5 || info.minY < waterLevel + 1.0 || info.range > 1.8) continue;
    } else if (p.type === 'tree' || p.type === 'rock' || p.type === 'bush') {
      if (info.centerY < waterLevel + 1.8 || info.minY < waterLevel + 1.2) continue;
    } else if (small) {
      if (info.centerY < waterLevel + 1.8 || info.minY < waterLevel + 1.2) continue;
    } else {
      if (info.centerY < waterLevel + 2.2 || info.minY < waterLevel + 1.6 || info.range > 1.4) continue;
    }
    let baseY;
    if (p.type !== 'road' && p.type !== 'tree' && p.type !== 'rock' && !small) {
      baseY = Math.round(info.maxY / GRID) * GRID;
      if (baseY < info.maxY - 0.05) baseY += GRID;
    } else {
      baseY = Math.round(info.centerY * 20) / 20;
    }
    baseY = Math.round(baseY * 100) / 100;
    const out = { type: p.type, x, y: baseY, z, rot };
    if ((p.type === 'house' || p.type === 'cabin') && p.floors && p.floors > 1) out.floors = Math.max(1, Math.min(3, Math.round(p.floors)));
    safe.push(out);
  }

  const payload = { base: 'san-borondon', waterVegetation: 0.55, pieces: safe, generated: true };
  const json = JSON.stringify(payload, null, 2);

  const targets = ['public/maps/custom-map.json', 'dist/maps/custom-map.json'];
  for (const t of targets) {
    const dir = path.dirname(t);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(t, json, 'utf8');
    console.log('Wrote', t, safe.length, 'pieces');
  }
  const roadCount = safe.filter((p) => p.type === 'road').length;
  const houseCount = safe.filter((p) => p.type === 'house' || p.type === 'cabin').length;
  const decorCount = safe.filter((p) => ['crate','barrel','lamp','bench','bush','rock','container','wall','fence','tower','tree'].includes(p.type)).length;
  console.log('Done. Settlements:', settlementCenters.length, 'Roads:', roadCount, 'Buildings:', houseCount, 'Decor+others:', decorCount, 'Total:', safe.length);
}

main();
