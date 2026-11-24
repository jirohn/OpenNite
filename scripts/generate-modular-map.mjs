#!/usr/bin/env node
/**
 * Genera el mapa de prueba "Valle de las Terrazas" con terreno modular.
 *
 *   node scripts/generate-modular-map.mjs [salida.json]
 *
 * Por defecto escribe public/maps/valle-terrazas.json. El resultado es un mapa
 * normal (mismo formato que guarda el editor) con el bloque `modular`, así que
 * se puede abrir y retocar en el editor y jugar sin conversión.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash2, noise2 } from '../src/core/utils.js';
import { serializeMapData } from '../src/core/map-system.mjs';
import { MODULAR_DIRS, MODULAR_TILE as T, MODULAR_LEVEL as LV, modularKey } from '../src/core/modular-terrain.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.resolve(root, process.argv[2] || 'public/maps/valle-terrazas.json');

const SEED = 20261124;
const HALF_TILES = 22; // 44 x 44 teselas = 176 m
const BASE_Y = 0.5;
const ISLAND_R = 80;
const VILLAGE = { gx: -5, gz: 3, r: 6 }; // en teselas
const VILLAGE_LEVEL = 4;
const MESA = { x: 36, z: -34, r: 26 };

const cells = new Map();
const get = (gx, gz) => cells.get(modularKey(gx, gz));
const set = (gx, gz, c) => cells.set(modularKey(gx, gz), { gx, gz, surface: 'grass', shape: 'flat', dir: 0, edge: 'cliff', ...c });

// ------------------------------------------------------------------ relieve
for (let gz = -HALF_TILES; gz < HALF_TILES; gz++) {
  for (let gx = -HALF_TILES; gx < HALF_TILES; gx++) {
    const x = gx * T, z = gz * T;
    const ang = Math.atan2(z, x);
    const coast = ISLAND_R * (0.84 + noise2(Math.cos(ang) * 2.2 + 5, Math.sin(ang) * 2.2 + 5, SEED) * 0.3);
    const d = Math.hypot(x, z);
    if (d > coast) continue;
    let level;
    if (d > coast - 9) {
      level = 0;
    } else {
      const inland = 1 - d / coast;
      const n = noise2(x * 0.03, z * 0.03, SEED + 7);
      let h = 1 + inland * 6.5 + (n - 0.5) * 3;
      // Mesa con acantilados altos al noreste.
      const dm = Math.hypot(x - MESA.x, z - MESA.z);
      if (dm < MESA.r) h = Math.max(h, 8 + (dm < MESA.r * 0.55 ? 2 : 0));
      level = Math.max(1, Math.floor(h));
    }
    // Meseta del pueblo
    const dv = Math.hypot(gx - VILLAGE.gx, gz - VILLAGE.gz);
    if (dv <= VILLAGE.r) level = VILLAGE_LEVEL;
    else if (dv <= VILLAGE.r + 2 && level > 0) level = Math.min(level, VILLAGE_LEVEL - 1);
    set(gx, gz, {
      level,
      surface: level === 0 ? 'sand' : 'grass',
      // Terrazas con muro de piedra alrededor del pueblo; acantilado en el resto.
      edge: dv <= VILLAGE.r + 4 && level > 0 ? 'wall' : 'cliff',
    });
  }
}

// ------------------------------------------------------------ calles del pueblo
for (const c of cells.values()) {
  const dx = c.gx - VILLAGE.gx, dz = c.gz - VILLAGE.gz;
  const dv = Math.hypot(dx, dz);
  if (dv > VILLAGE.r) continue;
  if (dx === 0 || dz === 0 || (Math.abs(dx) <= 1 && Math.abs(dz) <= 1)) c.surface = 'cobble';
}

// --------------------------------------------------------------- caminos
/** Celdas 4-conectadas entre dos teselas (primero en el eje más largo). */
function line(a, b) {
  const out = [];
  let x = a[0], z = a[1];
  out.push([x, z]);
  while (x !== b[0] || z !== b[1]) {
    const ddx = b[0] - x, ddz = b[1] - z;
    if (Math.abs(ddx) >= Math.abs(ddz)) x += Math.sign(ddx); else z += Math.sign(ddz);
    out.push([x, z]);
  }
  return out;
}

function dirTo(a, b) {
  const dx = b.gx - a.gx, dz = b.gz - a.gz;
  return MODULAR_DIRS.findIndex(([x, z]) => x === dx && z === dz);
}

/**
 * Traza un camino por la lista de teselas. Cada cambio de nivel se resuelve con
 * una escalera (o rampa) de un nivel, recortando el terreno si hace falta:
 * eso crea pasos entre acantilados como en las terrazas de referencia.
 */
function carvePath(waypoints, surface, useRamps = false) {
  const route = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const seg = line(waypoints[i], waypoints[i + 1]);
    route.push(...(i ? seg.slice(1) : seg));
  }
  let prev = null;
  for (const [gx, gz] of route) {
    const c = get(gx, gz);
    if (!c) { prev = null; continue; }
    const inVillage = Math.hypot(gx - VILLAGE.gx, gz - VILLAGE.gz) <= VILLAGE.r;
    if (!inVillage && c.surface !== 'sand') c.surface = surface;
    if (prev) {
      const top = prev.shape === 'flat' ? prev.level : prev.level + (dirTo(prev, c) === prev.dir ? 1 : 0);
      const diff = c.level - top;
      const ramp = useRamps && hash2(gx, gz, SEED + 9) < 0.5;
      if (diff >= 1 && !inVillage) {
        // Subida: la tesela anterior pasa a escalera/rampa hacia esta.
        if (prev.shape === 'flat') {
          prev.shape = ramp ? 'ramp' : 'stairs';
          prev.dir = dirTo(prev, c);
          c.level = prev.level + 1;
        } else {
          c.level = top;
        }
      } else if (diff >= 1 && inVillage) {
        if (prev.shape === 'flat') { prev.shape = 'stairs'; prev.dir = dirTo(prev, c); prev.level = c.level - 1; }
      } else if (diff <= -1) {
        // Bajada: esta tesela es escalera/rampa que sube hacia la anterior.
        c.level = top - 1;
        c.shape = ramp ? 'ramp' : 'stairs';
        c.dir = dirTo(c, prev);
      } else if (c.shape !== 'flat') {
        c.shape = 'flat';
      }
      if (c.shape === 'flat' && diff === 0) c.level = top;
    }
    prev = c;
  }
  return route;
}

const v = [VILLAGE.gx, VILLAGE.gz];
const routes = [
  carvePath([[1, 19], [0, 12], [-5, 9], v], 'path', true), // playa sur -> pueblo
  carvePath([v, [-5, -3], [2, -6], [6, -9], [9, -8]], 'path'), // pueblo -> mesa
  carvePath([[-19, 2], [-14, 3], v], 'path', true), // playa oeste -> pueblo
  carvePath([[1, 19], [8, 14], [14, 8], [16, 0]], 'path', true), // costa este
];

// Escaleras finales hacia lo alto de la mesa
carvePath([[9, -8], [9, -11]], 'path');

// ----------------------------------------------------------------- piezas
const pieces = [];
const pathSet = new Set(routes.flat().map(([a, b]) => modularKey(a, b)));
const topY = (c) => BASE_Y + c.level * LV;

// Casas del pueblo en las cuatro manzanas.
const houses = [
  { dx: -2.5, dz: -2.5, rot: 0 }, { dx: 2.5, dz: -2.5, rot: 0 },
  { dx: -2.5, dz: 2.5, rot: Math.PI }, { dx: 2.5, dz: 2.5, rot: Math.PI },
];
for (const h of houses) {
  const x = Math.round(((VILLAGE.gx + h.dx) * T) / 2) * 2;
  const z = Math.round(((VILLAGE.gz + h.dz) * T) / 2) * 2;
  pieces.push({ type: 'house', x, z, y: BASE_Y + VILLAGE_LEVEL * LV, rot: h.rot });
  pieces.push({ type: 'chest', x: x + (h.dx < 0 ? 6 : -6), z, y: BASE_Y + VILLAGE_LEVEL * LV, rot: 0 });
}

let trees = 0, rocks = 0, bushes = 0, weapons = 0;
for (const c of cells.values()) {
  const x = c.gx * T, z = c.gz * T;
  const key = modularKey(c.gx, c.gz);
  const dv = Math.hypot(c.gx - VILLAGE.gx, c.gz - VILLAGE.gz);
  const h = hash2(c.gx, c.gz, SEED + 21);
  const y = topY(c);
  if (c.shape !== 'flat') continue;
  if (pathSet.has(key) || c.surface !== 'grass') {
    if (pathSet.has(key) && h < 0.09 && weapons < 26) { pieces.push({ type: 'weapon_spawn', x, z, y, rot: 0 }); weapons++; }
    continue;
  }
  if (dv <= VILLAGE.r + 0.5) continue;
  const forest = noise2(x * 0.035, z * 0.035, SEED + 3);
  if (forest > 0.52 && h < 0.55) {
    const kind = c.level >= 6 ? 'tree_pine' : forest > 0.74 ? 'tree_autumn' : (h < 0.25 ? 'tree_round' : 'tree_pine');
    pieces.push({ type: kind, x, z, y, rot: h * Math.PI * 2 });
    trees++;
  } else if (h > 0.93) {
    pieces.push({ type: 'rock_big', x, z, y, rot: h * 6 });
    rocks++;
  } else if (h > 0.8) {
    pieces.push({ type: 'bush', x, z, y, rot: h * 6 });
    bushes++;
  } else if (h > 0.76 && c.level > 0) {
    pieces.push({ type: 'rock_small', x, z, y, rot: h * 6 });
    rocks++;
  } else if (h > 0.72 && weapons < 26) {
    pieces.push({ type: 'weapon_spawn', x, z, y, rot: 0 });
    weapons++;
  } else if (h > 0.705) {
    pieces.push({ type: 'chest', x, z, y, rot: 0 });
  }
}

// Vallas de madera en los bordes de los caminos que dan a un desnivel.
let fences = 0;
for (const key of pathSet) {
  const c = cells.get(key);
  if (!c || c.shape !== 'flat' || c.level === 0) continue;
  for (let d = 0; d < 4; d++) {
    const [dx, dz] = MODULAR_DIRS[d];
    const n = get(c.gx + dx, c.gz + dz);
    if (n && n.level >= c.level) continue;
    if (n && pathSet.has(modularKey(n.gx, n.gz))) continue;
    if (n && c.level - n.level < 1) continue;
    const ex = c.gx * T + dx * 1.8, ez = c.gz * T + dz * 1.8;
    // La valla (2 m) va a lo largo de Z con rot 0.
    const rot = dx !== 0 ? 0 : Math.PI / 2;
    // Las piezas se ajustan a la rejilla de 2 m: una valla centrada por borde.
    pieces.push({ type: 'fence', x: ex, z: ez, y: topY(c), rot });
    fences++;
  }
}

const map = {
  id: 'valle-terrazas',
  name: 'Valle de las Terrazas',
  version: 1,
  theme: 'temperate',
  size: 200,
  seed: SEED,
  waterLevel: 0,
  waterVegetation: 0.5,
  terrain: { cell: 2, heights: [] },
  modular: { tile: T, level: LV, baseY: BASE_Y, outside: 'sea', cells: [...cells.values()] },
  pieces,
  pois: [
    { name: 'Aldea del Valle', type: 'town', x: VILLAGE.gx * T, z: VILLAGE.gz * T, radius: 26 },
    { name: 'Risco Alto', type: 'tower', x: MESA.x, z: MESA.z, radius: 22 },
    { name: 'Playa Dorada', type: 'harbor', x: 4, z: 72, radius: 18 },
  ],
};

const json = serializeMapData(map);
// Campos extra que el juego lee del mapa (serializeMapData no los incluye).
json.type = 'island';
json.lootDensity = 1;
fs.writeFileSync(outFile, JSON.stringify(json));
console.log(`OK ${path.relative(root, outFile)}: ${cells.size} teselas, ${pieces.length} piezas (${trees} árboles, ${rocks} rocas, ${bushes} arbustos, ${fences} vallas, ${weapons} armas)`);
