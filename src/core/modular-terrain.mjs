/**
 * OpenNite - Terreno modular (datos + alturas), compartido por el juego y el editor.
 *
 * El terreno modular es una rejilla de teselas de 4 m (igual que ROAD_CELL_SIZE)
 * apiladas por niveles de 1.25 m (media planta: 2 niveles = FLOOR_HEIGHT).
 * Cada tesela guarda su nivel, su superficie (hierba, camino, empedrado...),
 * su forma (plana, rampa o escaleras) y el estilo de su borde cuando queda por
 * encima de la vecina (acantilado de roca o muro de terraza).
 *
 * Este módulo NO depende de Three.js: lo usan map-system.mjs (evaluateTerrainHeight),
 * World y el editor, de modo que la altura es exactamente la misma en todos.
 *
 * Formato JSON dentro del mapa:
 *   "modular": {
 *     "tile": 4, "level": 1.25, "baseY": 0.5, "outside": "sea",
 *     "cells": [[gx, gz, nivel, superficie?, forma?, dir?, borde?, redondeo?], ...]
 *   }
 *   - gx, gz: índice de tesela. El centro de la tesela está en (gx * tile, gz * tile).
 *   - superficie: grass | path | cobble | sand | stone   (por defecto grass)
 *   - forma: flat | ramp | stairs                         (por defecto flat)
 *   - dir: hacia dónde SUBE la rampa/escalera: 0 = -Z (norte), 1 = +X (este),
 *          2 = +Z (sur), 3 = -X (oeste). Sube exactamente 1 nivel.
 *   - borde: cliff | wall                                 (por defecto cliff)
 *   - redondeo: 0..1. Redondea en planta las esquinas convexas de la tesela
 *     (radio = redondeo * tile / 2) cuando las tres vecinas de esa esquina están
 *     a la misma altura (o no existen). Lo pinta el pincel de redondeo del editor.
 *   - tile y level son configurables por mundo (resolución de teselas).
 *   - outside: qué hay fuera de las teselas: "sea" (fondo marino) o "terrain"
 *     (el terreno procedural/editado de siempre).
 */

export const MODULAR_TILE = 4;
export const MODULAR_LEVEL = 1.25;
export const MODULAR_STAIR_STEPS = 5; // con level 1.25: 0.25 m por escalón (< MAX_STEP_UP del jugador)
export const MODULAR_MAX_STEP = 0.25; // altura máxima de cada peldaño
export const MODULAR_TILE_OPTIONS = [1, 2, 4, 8];
export const MODULAR_LEVEL_OPTIONS = [0.5, 1, 1.25, 2.5];

/** Número de peldaños de una escalera (siempre subibles a pie, sea cual sea `level`). */
export function modularStairSteps(mod) {
  return Math.max(2, Math.ceil(mod.level / MODULAR_MAX_STEP - 1e-6));
}
export const MODULAR_SEA_DEPTH = 8; // profundidad del fondo marino bajo baseY

export const MODULAR_SURFACES = ['grass', 'path', 'cobble', 'sand', 'stone'];
export const MODULAR_SHAPES = ['flat', 'ramp', 'stairs'];
export const MODULAR_EDGES = ['cliff', 'wall'];

/** Direcciones cardinales: 0 = -Z, 1 = +X, 2 = +Z, 3 = -X. */
export const MODULAR_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function modularKey(gx, gz) {
  return `${gx},${gz}`;
}

/** Índice de tesela que contiene la coordenada mundial v. */
export function modularIndex(v, tile = MODULAR_TILE) {
  return Math.floor(v / tile + 0.5);
}

function normalizeCell(gx, gz, level, surface, shape, dir, edge, round) {
  const r = num(round, 0);
  return {
    round: r > 0 ? Math.min(1, Math.round(r * 20) / 20) : 0,
    gx,
    gz,
    level: Math.round(num(level, 0)),
    surface: MODULAR_SURFACES.includes(surface) ? surface : 'grass',
    shape: MODULAR_SHAPES.includes(shape) ? shape : 'flat',
    dir: ((Math.round(num(dir, 0)) % 4) + 4) % 4,
    edge: MODULAR_EDGES.includes(edge) ? edge : 'cliff',
  };
}

/**
 * Normaliza el bloque `modular` de un mapa (JSON crudo o ya normalizado).
 * Devuelve null si el mapa no tiene terreno modular.
 */
export function normalizeModularTerrain(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const tile = Math.max(1, num(raw.tile, MODULAR_TILE));
  const level = Math.max(0.25, num(raw.level, MODULAR_LEVEL));
  const baseY = num(raw.baseY, 0.5);
  const outside = raw.outside === 'terrain' ? 'terrain' : 'sea';
  const cells = new Map();
  if (raw.cells instanceof Map) {
    for (const c of raw.cells.values()) {
      const gx = Math.round(num(c.gx, 0));
      const gz = Math.round(num(c.gz, 0));
      cells.set(modularKey(gx, gz), normalizeCell(gx, gz, c.level, c.surface, c.shape, c.dir, c.edge, c.round));
    }
  } else if (Array.isArray(raw.cells)) {
    for (const item of raw.cells) {
      let c = item;
      if (Array.isArray(item)) {
        if (item.length < 3) continue;
        c = { gx: item[0], gz: item[1], level: item[2], surface: item[3], shape: item[4], dir: item[5], edge: item[6], round: item[7] };
      }
      if (!c || typeof c !== 'object') continue;
      const gx = Math.round(Number(c.gx));
      const gz = Math.round(Number(c.gz));
      if (!Number.isFinite(gx) || !Number.isFinite(gz)) continue;
      cells.set(modularKey(gx, gz), normalizeCell(gx, gz, c.level, c.surface, c.shape, c.dir, c.edge, c.round));
    }
  }
  if (!cells.size) return null;
  return { tile, level, baseY, outside, seaFloor: baseY - MODULAR_SEA_DEPTH, cells };
}

/** Serializa a JSON compacto (omite los valores por defecto al final de cada tesela). */
export function serializeModularTerrain(mod) {
  const norm = normalizeModularTerrain(mod);
  if (!norm) return undefined;
  const cells = [];
  for (const c of norm.cells.values()) {
    const row = [c.gx, c.gz, c.level, c.surface, c.shape, c.dir, c.edge, c.round || 0];
    const defaults = [null, null, null, 'grass', 'flat', 0, 'cliff', 0];
    while (row.length > 3 && row[row.length - 1] === defaults[row.length - 1]) row.pop();
    cells.push(row);
  }
  cells.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  return { tile: norm.tile, level: norm.level, baseY: norm.baseY, outside: norm.outside, cells };
}

export function modularCellAt(mod, x, z) {
  if (!mod || !mod.cells) return null;
  return mod.cells.get(modularKey(modularIndex(x, mod.tile), modularIndex(z, mod.tile))) || null;
}

/** Altura de la parte superior plana de una tesela (nivel bajo para rampas/escaleras). */
export function modularLevelY(mod, level) {
  return mod.baseY + level * mod.level;
}

/** Avance 0..1 dentro de la tesela en la dirección `dir` (0 = borde bajo, 1 = borde alto). */
export function modularUAlong(mod, cell, x, z) {
  const t = mod.tile;
  const cx = cell.gx * t, cz = cell.gz * t;
  let u;
  switch (cell.dir) {
    case 0: u = (cz + t / 2 - z) / t; break;
    case 1: u = (x - (cx - t / 2)) / t; break;
    case 2: u = (z - (cz - t / 2)) / t; break;
    default: u = (cx + t / 2 - x) / t; break;
  }
  return u < 0 ? 0 : u > 1 ? 1 : u;
}

/** Altura exacta de la superficie de una tesela en (x, z). */
export function modularCellTopAt(mod, cell, x, z) {
  const low = modularLevelY(mod, cell.level);
  if (cell.shape === 'flat') return low;
  const u = modularUAlong(mod, cell, x, z);
  if (cell.shape === 'ramp') return low + u * mod.level;
  const steps = modularStairSteps(mod);
  const k = Math.min(steps - 1, Math.floor(u * steps));
  return low + (k + 1) * (mod.level / steps);
}

/**
 * Altura del terreno modular en (x, z).
 * Devuelve null cuando no hay tesela y el exterior es terreno normal.
 */
export function modularHeightAt(mod, x, z) {
  if (!mod) return null;
  const cell = modularCellAt(mod, x, z);
  if (cell) {
    if (cell.round > 0) {
      const cut = modularCornerCut(mod, cell, x, z);
      if (cut) return cut.outside ? (mod.outside === 'sea' ? mod.seaFloor : null) : cut.y;
    }
    return modularCellTopAt(mod, cell, x, z);
  }
  return mod.outside === 'sea' ? mod.seaFloor : null;
}

/** Esquinas: 0 = (-X,-Z), 1 = (+X,-Z), 2 = (+X,+Z), 3 = (-X,+Z). */
export const MODULAR_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

const _cornerCache = new WeakMap();

/**
 * Información de redondeo de las 4 esquinas de una tesela. Una esquina se
 * redondea si la tesela es plana, tiene `round` > 0 y sus tres vecinas de esa
 * esquina (las dos laterales y la diagonal) no existen o son planas, del mismo
 * nivel entre sí y más bajas que ella. Así el hueco que deja el arco tiene un
 * suelo bien definido (la altura de esas vecinas) y no aparecen agujeros.
 */
export function modularCellCorners(mod, cell) {
  let info = _cornerCache.get(cell);
  if (info && info.mod === mod) return info.corners;
  const corners = [null, null, null, null];
  if (cell.round > 0 && cell.shape === 'flat') {
    const T = mod.tile;
    const R = cell.round * T / 2;
    for (let i = 0; i < 4; i++) {
      const [sx, sz] = MODULAR_CORNERS[i];
      const a = mod.cells.get(modularKey(cell.gx + sx, cell.gz));
      const b = mod.cells.get(modularKey(cell.gx, cell.gz + sz));
      const d = mod.cells.get(modularKey(cell.gx + sx, cell.gz + sz));
      const n = [a, b, d];
      const present = n.filter(Boolean);
      let ok = false, outside = false, y = 0, surface = 'grass';
      if (present.length === 0) {
        ok = true; outside = true;
      } else if (present.length === 3 && present.every((c) => c.shape === 'flat' && c.level === a.level) && a.level < cell.level) {
        ok = true; y = modularLevelY(mod, a.level); surface = a.surface;
      }
      if (!ok) continue;
      const cornerX = cell.gx * T + sx * T / 2;
      const cornerZ = cell.gz * T + sz * T / 2;
      corners[i] = { sx, sz, R, cornerX, cornerZ, cx: cornerX - sx * R, cz: cornerZ - sz * R, outside, y, surface };
    }
  }
  _cornerCache.set(cell, { mod, corners });
  return corners;
}

/** Si (x, z) cae en el trozo recortado por una esquina redondeada, devuelve esa esquina. */
export function modularCornerCut(mod, cell, x, z) {
  const corners = modularCellCorners(mod, cell);
  for (const c of corners) {
    if (!c) continue;
    const dx = (x - c.cx) * c.sx, dz = (z - c.cz) * c.sz;
    if (dx > 0 && dz > 0 && dx * dx + dz * dz > c.R * c.R) return c;
  }
  return null;
}

/**
 * Cambia la resolución de un mundo modular (tamaño de tesela y/o altura de nivel)
 * remuestreando las teselas: cada tesela nueva copia la tesela vieja que contiene
 * su centro y su nivel se reescala para conservar la altura real.
 */
export function resampleModularTerrain(mod, tile, level) {
  const src = normalizeModularTerrain(mod);
  if (!src) return null;
  const T = Math.max(0.5, Number(tile) || src.tile);
  const L = Math.max(0.25, Number(level) || src.level);
  const cells = new Map();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of src.cells.values()) {
    minX = Math.min(minX, (c.gx - 0.5) * src.tile); maxX = Math.max(maxX, (c.gx + 0.5) * src.tile);
    minZ = Math.min(minZ, (c.gz - 0.5) * src.tile); maxZ = Math.max(maxZ, (c.gz + 0.5) * src.tile);
  }
  for (let gz = modularIndex(minZ, T); gz <= modularIndex(maxZ, T); gz++) {
    for (let gx = modularIndex(minX, T); gx <= modularIndex(maxX, T); gx++) {
      const old = modularCellAt(src, gx * T, gz * T);
      if (!old) continue;
      const y = modularLevelY(src, old.level);
      const lvl = Math.round((y - src.baseY) / L);
      cells.set(modularKey(gx, gz), { ...old, gx, gz, level: lvl, shape: T === src.tile ? old.shape : 'flat' });
    }
  }
  return normalizeModularTerrain({ tile: T, level: L, baseY: src.baseY, outside: src.outside, cells });
}

/** Altura mínima de las teselas en un radio (para hundir la malla de heightfield bajo ellas). */
export function modularMinNear(mod, x, z, radius) {
  if (!mod) return null;
  const t = mod.tile;
  const x0 = modularIndex(x - radius, t), x1 = modularIndex(x + radius, t);
  const z0 = modularIndex(z - radius, t), z1 = modularIndex(z + radius, t);
  let min = Infinity;
  for (let gz = z0; gz <= z1; gz++) {
    for (let gx = x0; gx <= x1; gx++) {
      const c = mod.cells.get(modularKey(gx, gz));
      if (c) min = Math.min(min, modularLevelY(mod, c.level));
    }
  }
  return min === Infinity ? null : min;
}
