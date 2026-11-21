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
  const sizes = {
    house: [8, 6, 3], cabin: [4, 4, 2], tower: [5, 5, 2], container: [6, 2.4, 1], wall: [2, 0.4, 1],
    tree: [3, 3, 1], rock: [2.5, 2.5, 1], road: [4, 4, 0],
  };
  const [w, d, margin] = sizes[type] || [4, 4, 1];
  if (occupied(occ, x, z, w, d, rot)) return false;

  const info = sampleFootprint(heightAt, x, z, w, d, rot);
  if (type !== 'road' && type !== 'tree' && type !== 'rock') {
    if (info.centerY < waterLevel + 2.4) return false;
    if (info.minY < waterLevel + 1.8) return false;
    if (info.range > 0.9) return false; // huella suficientemente plana para construir (base + cimiento)
  } else if (type === 'road') {
    if (info.centerY < waterLevel + 1.8) return false;
    if (info.minY < waterLevel + 1.3) return false;
    if (info.range > 1.0) return false;
  } else {
    if (info.centerY < waterLevel + 2.0) return false;
    if (info.minY < waterLevel + 1.5) return false;
  }

  // Base nivelada: alinear a rejilla vertical de 2 studs (2x2x2) minimizando huecos
  let baseY = info.centerY;
  if (type !== 'road' && type !== 'tree' && type !== 'rock') {
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

function tryPlaceNear(pieces, occ, heightAt, waterLevel, type, cx, cz, radius, rotChoices, tries=30, rnd=Math.random) {
  for (let i = 0; i < tries; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * radius;
    const x = snap(cx + Math.cos(a) * r);
    const z = snap(cz + Math.sin(a) * r);
    const rot = rotChoices[Math.floor(rnd() * rotChoices.length)];
    if (placePiece(pieces, occ, heightAt, waterLevel, type, x, z, rot)) return true;
  }
  return false;
}

function main() {
  const mapPath = path.resolve('public/maps/san-borondon.json');
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const { heightAt, waterLevel, half, seed } = makeHeightFns(map);
  const rnd = makeRandom(seed + 4242);
  const pieces = [];
  const occ = new Set();
  const ROTS = [0, Math.PI/2, Math.PI, Math.PI*1.5];

  // Find flat plain centers by scanning (zonas amplias y utilizables como llanuras de construcción)
  function findPlains(count, minDist) {
    const found = [];
    let attempts = 0;
    while (found.length < count && attempts < 8000) {
      attempts++;
      const x = snap((rnd() * 2 - 1) * (half * 0.66));
      const z = snap((rnd() * 2 - 1) * (half * 0.66));
      if (!isPlain(heightAt, waterLevel, x, z, 14, 1.2)) continue;
      if (found.some(p => Math.hypot(p.x - x, p.z - z) < minDist)) continue;
      // comprobar un área amplia alrededor para asegurar llanura utilizable
      let ok = true;
      const offsets = [[0,0],[8,0],[-8,0],[0,8],[0,-8],[16,0],[-16,0],[0,16],[0,-16],[12,12],[-12,12],[12,-12],[-12,-12],[20,0],[-20,0],[0,20],[0,-20]];
      for (const [dx,dz] of offsets) {
        const info = sampleFootprint(heightAt, x + dx, z + dz, 8, 8, 0);
        if (info.centerY < waterLevel + 2.4 || info.minY < waterLevel + 1.8 || info.range > 1.4) { ok = false; break; }
      }
      if (!ok) continue;
      found.push({ x, z, y: heightAt(x, z) });
    }
    return found;
  }

  function buildVillage(center, opts = {}) {
    const { houses = 4, roads = true, walls = false } = opts;
    const cx = snap(center.x), cz = snap(center.z);
    // central cross of road tiles (modular, grid-aligned, 4x4u)
    if (roads) {
      for (let i = -3; i <= 3; i++) {
        placePiece(pieces, occ, heightAt, waterLevel, 'road', cx + i*4, cz, 0);
        placePiece(pieces, occ, heightAt, waterLevel, 'road', cx, cz + i*4, 0);
      }
      // small plaza ring
      for (const [dx,dz] of [[4,4],[4,-4],[-4,4],[-4,-4]]) {
        placePiece(pieces, occ, heightAt, waterLevel, 'road', cx+dx, cz+dz, 0);
      }
    }
    // houses around center with spacing
    const houseSlots = [
      [-14, -10, 0], [14, -10, Math.PI], [-14, 10, 0], [14, 10, Math.PI],
      [-14, 0, Math.PI/2], [14, 0, -Math.PI/2], [0, -14, 0], [0, 14, Math.PI],
      [-24, -10, 0], [24, -10, Math.PI], [-24, 10, 0], [24, 10, Math.PI],
    ];
    let placedH = 0;
    for (const [dx,dz,rot] of houseSlots) {
      if (placedH >= houses) break;
      let done = false;
      for (let r = 0; r <= 10 && !done; r += 2) {
        for (let a = 0; a < 8 && !done; a++) {
          const ang = (a / 8) * Math.PI * 2;
          const jx = r === 0 ? 0 : snap(Math.cos(ang) * r);
          const jz = r === 0 ? 0 : snap(Math.sin(ang) * r);
          const hx = snap(cx + dx + jx), hz = snap(cz + dz + jz);
          const floors = (placedH % 3 === 1) ? 2 : 1;
          if (placePiece(pieces, occ, heightAt, waterLevel, 'house', hx, hz, rot, { floors })) { placedH++; done = true; }
        }
      }
    }
    // some containers and details
    tryPlaceNear(pieces, occ, heightAt, waterLevel, 'container', cx, cz, 18, ROTS, 12, rnd);
    tryPlaceNear(pieces, occ, heightAt, waterLevel, 'container', cx, cz, 18, ROTS, 12, rnd);
    // perimeter walls (optional, short kit-wall segments 2u)
    if (walls) {
      for (let i = -4; i <= 4; i += 1) {
        placePiece(pieces, occ, heightAt, waterLevel, 'wall', cx + i*2, cz - 22, 0);
        placePiece(pieces, occ, heightAt, waterLevel, 'wall', cx + i*2, cz + 22, 0);
      }
    }
    // Naturaleza decorativa la aporta el mundo por zonas (bosque/terreno/playa) para evitar duplicados.
  }

  function buildHamlet(center) {
    const cx = snap(center.x), cz = snap(center.z);
    // short road
    for (let i = -1; i <= 1; i++) placePiece(pieces, occ, heightAt, waterLevel, 'road', cx + i*4, cz, 0);
    placePiece(pieces, occ, heightAt, waterLevel, 'road', cx, cz + 4, 0);
    const slots = [[-10,-8,0],[10,-8,Math.PI],[0,-12,Math.PI/2]];
    let n = 0;
    for (const [dx,dz,rot] of slots) {
      if (n >= 2) break;
      let done = false;
      for (let r = 0; r <= 10 && !done; r += 2) {
        for (let a = 0; a < 8 && !done; a++) {
          const ang = (a / 8) * Math.PI * 2;
          const jx = r === 0 ? 0 : snap(Math.cos(ang) * r);
          const jz = r === 0 ? 0 : snap(Math.sin(ang) * r);
          const hx = snap(cx + dx + jx), hz = snap(cz + dz + jz);
          const floors = (n === 0 && rnd() < 0.4) ? 2 : 1;
          if (placePiece(pieces, occ, heightAt, waterLevel, 'house', hx, hz, rot, { floors })) { n++; done = true; }
        }
      }
    }
    tryPlaceNear(pieces, occ, heightAt, waterLevel, 'container', cx, cz, 14, ROTS, 8, rnd);
    // Naturaleza decorativa la aporta el mundo por zonas.
  }

  function buildTowerOutpost(center) {
    const cx = snap(center.x), cz = snap(center.z);
    if (!isPlain(heightAt, waterLevel, cx, cz, 6, 0.8)) return false;
    if (!placePiece(pieces, occ, heightAt, waterLevel, 'tower', cx, cz, 0)) return false;
    for (const [dx,dz] of [[6,0],[-6,0],[0,6],[0,-6]]) placePiece(pieces, occ, heightAt, waterLevel, 'road', cx+dx, cz+dz, 0);
    for (let i = 0; i < 4; i++) tryPlaceNear(pieces, occ, heightAt, waterLevel, 'wall', cx, cz, 10, ROTS, 15, rnd);
    tryPlaceNear(pieces, occ, heightAt, waterLevel, 'container', cx, cz, 12, ROTS, 8, rnd);
    return true;
  }

  // Build settlements
  const plains = findPlains(8, 55);
  const settlementCenters = [];
  if (plains.length >= 1) { buildVillage(plains[0], { houses: 6, roads: true, walls: true }); settlementCenters.push(plains[0]); }
  if (plains.length >= 2) { buildVillage(plains[1], { houses: 5, roads: true, walls: false }); settlementCenters.push(plains[1]); }
  if (plains.length >= 3) { buildHamlet(plains[2]); settlementCenters.push(plains[2]); }
  if (plains.length >= 4) { buildHamlet(plains[3]); settlementCenters.push(plains[3]); }
  if (plains.length >= 5) { if (buildTowerOutpost(plains[4])) settlementCenters.push(plains[4]); }
  if (plains.length >= 6) { buildHamlet(plains[5]); settlementCenters.push(plains[5]); }
  if (plains.length >= 7) { if (buildTowerOutpost(plains[6])) settlementCenters.push(plains[6]); }
  if (plains.length >= 8) { buildHamlet(plains[7]); settlementCenters.push(plains[7]); }

  // Extra standalone houses on plains if we found few
  if (plains.length < 3) {
    const extras = findPlains(6, 40);
    for (const c of extras) { buildHamlet(c); settlementCenters.push(c); }
  }

  // Cabañas de madera en zonas de bosque (piezas de kit, mapa limpio)
  function placeForestCabins(count = 10) {
    let placed = 0;
    for (let tries = 0; tries < 6000 && placed < count; tries++) {
      const x = snap((rnd() * 2 - 1) * (half * 0.72));
      const z = snap((rnd() * 2 - 1) * (half * 0.72));
      if (getNatureZone(x, z, heightAt, waterLevel, seed) !== 'forest') continue;
      const info = sampleFootprint(heightAt, x, z, 4, 4, 0);
      if (info.centerY < waterLevel + 2.6 || info.minY < waterLevel + 2.0 || info.range > 1.1) continue;
      let nearSettlement = false;
      for (const c of settlementCenters) { if (Math.hypot(c.x - x, c.z - z) < 26) { nearSettlement = true; break; } }
      if (nearSettlement) continue;
      let closeCabin = false;
      for (const p of pieces) { if (p.type === 'cabin' && Math.hypot(p.x - x, p.z - z) < 18) { closeCabin = true; break; } }
      if (closeCabin) continue;
      const rot = ROTS[Math.floor(rnd() * ROTS.length)];
      const floors = rnd() < 0.22 ? 2 : 1;
      if (placePiece(pieces, occ, heightAt, waterLevel, 'cabin', x, z, rot, { floors })) placed++;
    }
    return placed;
  }
  placeForestCabins(10);

  // Filtro final de seguridad: mantener solo piezas en terreno válido y bien apoyadas
  const safe = [];
  for (const p of pieces) {
    const x = snap(p.x), z = snap(p.z), rot = p.rot || 0;
    const sizes = {
      house: [8, 6], cabin: [4, 4], tower: [5, 5], container: [6, 2.4], wall: [2, 0.4],
      tree: [3, 3], rock: [2.5, 2.5], road: [4, 4],
    };
    const [w, d] = sizes[p.type] || [4, 4];
    const info = sampleFootprint(heightAt, x, z, w, d, rot);
    if (p.type === 'road') {
      if (info.centerY < waterLevel + 1.8 || info.minY < waterLevel + 1.3 || info.range > 1.1) continue;
    } else if (p.type === 'tree' || p.type === 'rock') {
      if (info.centerY < waterLevel + 2.0 || info.minY < waterLevel + 1.5) continue;
    } else {
      if (info.centerY < waterLevel + 2.4 || info.minY < waterLevel + 1.8 || info.range > 1.0) continue;
    }
    let baseY;
    if (p.type !== 'road' && p.type !== 'tree' && p.type !== 'rock') {
      baseY = Math.round(info.maxY / GRID) * GRID;
      if (baseY < info.maxY - 0.05) baseY += GRID;
    } else if (p.type === 'road') {
      baseY = Math.round(info.centerY * 20) / 20;
    } else {
      baseY = Math.round(info.centerY * 20) / 20;
    }
    baseY = Math.round(baseY * 100) / 100;
    const out = { type: p.type, x, y: baseY, z, rot };
    if ((p.type === 'house' || p.type === 'cabin') && p.floors && p.floors > 1) out.floors = Math.max(1, Math.min(3, Math.round(p.floors)));
    safe.push(out);
  }

  const payload = { base: 'san-borondon', pieces: safe, generated: true };
  const json = JSON.stringify(payload, null, 2);

  const targets = ['public/maps/custom-map.json', 'dist/maps/custom-map.json'];
  for (const t of targets) {
    const dir = path.dirname(t);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(t, json, 'utf8');
    console.log('Wrote', t, safe.length, 'pieces');
  }
  console.log('Done. Plains found:', plains.length, 'Total pieces:', safe.length);
}

main();
